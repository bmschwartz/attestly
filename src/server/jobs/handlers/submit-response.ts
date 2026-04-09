import type { BackgroundJob } from "../../../../generated/prisma";
import { db } from "~/server/jobs/db";
import { computeBlindedId } from "~/lib/eip712/blinded-id";
import { hashAnswers } from "~/lib/eip712/hash";
import { QUESTION_TYPE_INDEX, type ResponseAnswer } from "~/lib/eip712/types";
import { pinResponse } from "~/lib/ipfs/pin-response";
import { submitResponseOnChain } from "~/server/blockchain/contract";
import { getPublicClient } from "~/server/blockchain/provider";
import { attestlyAbi } from "~/server/blockchain/abi";
import { relayAndConfirm } from "~/server/blockchain/relayer";
import { getRelayerAddress } from "~/server/blockchain/provider";
import type { Hex } from "viem";

/**
 * Job payload for SUBMIT_RESPONSE.
 * Set by the response.submit tRPC procedure when queuing the job.
 */
interface SubmitResponsePayload {
  responseId: string;
  signature: string;
}

/**
 * Handle a SUBMIT_RESPONSE background job.
 *
 * Flow:
 * 1. Load response + answers + survey from DB
 * 2. Verify survey has been published on-chain (contentHash exists)
 * 3. Compute blinded ID
 * 4. Pin response JSON to IPFS -> get CID
 * 5. Submit submitResponse tx to contract via relayer
 * 6. Wait for confirmation
 * 7. Update Response record
 */
export async function handleSubmitResponse(job: BackgroundJob): Promise<void> {
  const payload = job.payload as unknown as SubmitResponsePayload;
  const { responseId, signature } = payload;

  // 1. Load response + answers + survey
  const response = await db.response.findUniqueOrThrow({
    where: { id: responseId },
    include: {
      answers: {
        orderBy: { question: { position: "asc" } },
        include: {
          question: { select: { position: true, questionType: true } },
        },
      },
      survey: {
        select: {
          id: true,
          contentHash: true,
          verificationStatus: true,
        },
      },
      respondent: {
        select: { walletAddress: true },
      },
    },
  });

  // 2. Verify survey has been published on-chain
  const surveyHash = response.survey.contentHash;
  if (!surveyHash) {
    throw new Error(
      `Survey ${response.survey.id} has no contentHash. PUBLISH_SURVEY must complete first.`,
    );
  }

  if (
    !response.respondent.walletAddress ||
    response.respondent.walletAddress === "pending"
  ) {
    throw new Error(
      `Respondent wallet not available for response ${responseId}`,
    );
  }

  // 3. Compute blinded ID
  const blindedId = computeBlindedId(
    response.respondent.walletAddress as `0x${string}`,
    surveyHash as `0x${string}`,
  );

  // Update blindedId early so it's available if the job fails and restarts.
  await db.response.update({
    where: { id: responseId },
    data: {
      blindedId,
      verificationStatus: "PENDING",
    },
  });

  // 4. Pin response JSON to IPFS
  // IPFS schema uses numeric questionType (matching EIP-712's uint8)
  const ipfsAnswers = response.answers.map((a) => ({
    questionIndex: a.question.position,
    questionType: QUESTION_TYPE_INDEX[a.question.questionType] ?? 0,
    value: a.value,
  }));

  const ipfsCid = await pinResponse({
    surveyHash,
    respondent: blindedId,
    answers: ipfsAnswers,
    signature,
  });

  // Compute answersHash for the contract
  const eip712Answers: ResponseAnswer[] = response.answers.map((a) => ({
    questionIndex: a.question.position,
    questionType: QUESTION_TYPE_INDEX[a.question.questionType] ?? 0,
    value: a.value,
  }));
  const answersHash = hashAnswers(eip712Answers);
  const answerCount = response.answers.length;
  const contractAddress = process.env
    .ATTESTLY_CONTRACT_ADDRESS as `0x${string}`;

  // 5-6. Submit tx and wait for confirmation (includes gas ceiling check)
  const { txHash, receipt } = await relayAndConfirm(
    () =>
      getPublicClient().estimateContractGas({
        address: contractAddress,
        abi: attestlyAbi,
        functionName: "submitResponse",
        account: getRelayerAddress(),
        args: [
          surveyHash as Hex,
          blindedId as Hex,
          ipfsCid,
          answerCount,
          answersHash,
          signature as Hex,
        ],
      }),
    () =>
      submitResponseOnChain(
        surveyHash as Hex,
        blindedId as Hex,
        ipfsCid,
        answerCount,
        answersHash,
        signature as Hex,
      ),
    "submitResponse",
    `submitResponse for response ${responseId} (survey: ${surveyHash.slice(0, 10)}...)`,
  );

  // 7. Get block timestamp (receipt does not include timestamp)
  const block = await getPublicClient().getBlock({
    blockNumber: receipt.blockNumber,
  });

  // Update Response record with tx hash and block metadata
  await db.response.update({
    where: { id: responseId },
    data: {
      blindedId,
      ipfsCid,
      status: "SUBMITTED",
      submittedAt: new Date(),
      submitTxHash: txHash,
      submitBlockNumber: receipt.blockNumber.toString(),
      submitBlockTimestamp: new Date(Number(block.timestamp) * 1000),
      verificationStatus: "VERIFIED",
    },
  });

  console.log(
    `[SubmitResponse] Response ${responseId} submitted on-chain. BlindedId: ${blindedId.slice(0, 10)}..., CID: ${ipfsCid}, Tx: ${txHash}`,
  );
}
