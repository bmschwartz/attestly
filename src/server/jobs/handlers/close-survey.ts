import type { BackgroundJob } from "../../../../generated/prisma";
import { db } from "~/server/jobs/db";
import { closeSurveyOnChain } from "~/server/blockchain/contract";
import { getPublicClient } from "~/server/blockchain/provider";
import { attestlyAbi } from "~/server/blockchain/abi";
import { relayAndConfirm } from "~/server/blockchain/relayer";
import { createJob } from "~/server/jobs/queue";
import type { Hex } from "viem";

/**
 * Job payload for CLOSE_SURVEY.
 */
interface CloseSurveyPayload {
  surveyId: string;
  signature: string;
}

/**
 * Handle a CLOSE_SURVEY background job.
 *
 * Flow:
 * 1. Load survey from DB (must have contentHash from PUBLISH_SURVEY)
 * 2. Submit closeSurvey tx to contract via relayer
 * 3. Wait for confirmation
 * 4. Update Survey record (closeTxHash)
 * 5. Soft-delete IN_PROGRESS responses
 * 6. Queue GENERATE_AI_SUMMARY and VERIFY_RESPONSES jobs
 */
export async function handleCloseSurvey(job: BackgroundJob): Promise<void> {
  const payload = job.payload as unknown as CloseSurveyPayload;
  const { surveyId, signature } = payload;

  // 1. Load survey
  const survey = await db.survey.findUniqueOrThrow({
    where: { id: surveyId },
    select: { id: true, contentHash: true },
  });

  if (!survey.contentHash) {
    throw new Error(
      `Survey ${surveyId} has no contentHash. PUBLISH_SURVEY must complete first.`,
    );
  }

  const surveyHash = survey.contentHash;
  const contractAddress = process.env
    .ATTESTLY_CONTRACT_ADDRESS as `0x${string}`;

  // 2-3. Submit tx and wait for confirmation (includes gas ceiling check)
  const { txHash, receipt } = await relayAndConfirm(
    () =>
      getPublicClient().estimateContractGas({
        address: contractAddress,
        abi: attestlyAbi,
        functionName: "closeSurvey",
        args: [surveyHash as Hex, signature as Hex],
      }),
    () => closeSurveyOnChain(surveyHash as Hex, signature as Hex),
    "closeSurvey",
    `closeSurvey for survey ${surveyId} (hash: ${surveyHash.slice(0, 10)}...)`,
  );

  // 4. Get block timestamp (receipt does not include timestamp)
  const block = await getPublicClient().getBlock({
    blockNumber: receipt.blockNumber,
  });

  // Update Survey record with tx hash, block metadata, and final status
  await db.survey.update({
    where: { id: surveyId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closeTxHash: txHash,
      closeBlockNumber: receipt.blockNumber.toString(),
      closeBlockTimestamp: new Date(Number(block.timestamp) * 1000),
    },
  });

  // Soft-delete IN_PROGRESS responses (abandoned responses for this survey)
  await db.response.updateMany({
    where: {
      surveyId,
      status: "IN_PROGRESS",
    },
    data: {
      deletedAt: new Date(),
    },
  });

  // Enqueue AI summary generation
  await createJob({
    type: "GENERATE_AI_SUMMARY",
    surveyId,
    payload: { surveyId },
  });

  // 5. Queue VERIFY_RESPONSES job
  await createJob({
    type: "VERIFY_RESPONSES",
    surveyId,
    payload: { surveyId },
  });

  console.log(
    `[CloseSurvey] Survey ${surveyId} closed on-chain. Tx: ${txHash}. VERIFY_RESPONSES queued.`,
  );
}
