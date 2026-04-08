import type { BackgroundJob } from "../../../../generated/prisma";
import { db } from "~/server/jobs/db";
import { hashSurvey } from "~/lib/eip712/hash";
import type { SurveyMessage, SurveyQuestion } from "~/lib/eip712/types";
import { pinSurvey } from "~/lib/ipfs/pin-survey";
import { publishSurveyOnChain } from "~/server/blockchain/contract";
import { getPublicClient } from "~/server/blockchain/provider";
import { attestlyAbi } from "~/server/blockchain/abi";
import { relayAndConfirm } from "~/server/blockchain/relayer";
import type { Hex } from "viem";

/** Map Prisma QuestionType enum string to uint8 for EIP-712 hashing. */
const QUESTION_TYPE_INDEX: Record<string, number> = {
  SINGLE_SELECT: 0,
  MULTIPLE_CHOICE: 1,
  RATING: 2,
  FREE_TEXT: 3,
};

/**
 * Job payload for PUBLISH_SURVEY.
 * Set by the survey.publish tRPC procedure when queuing the job.
 */
interface PublishSurveyPayload {
  surveyId: string;
  signature: string;
}

/**
 * Handle a PUBLISH_SURVEY background job.
 *
 * Flow:
 * 1. Load survey + questions from DB
 * 2. Build EIP-712 message, compute surveyHash
 * 3. Pin survey JSON to IPFS -> get CID
 * 4. Submit publishSurvey tx to contract via relayer
 * 5. Wait for confirmation
 * 6. Update Survey record (contentHash, ipfsCid, publishTxHash, verificationStatus)
 */
export async function handlePublishSurvey(job: BackgroundJob): Promise<void> {
  const payload = job.payload as unknown as PublishSurveyPayload;
  const { surveyId, signature } = payload;

  // 1. Load survey + questions from DB
  const survey = await db.survey.findUniqueOrThrow({
    where: { id: surveyId },
    include: {
      questions: {
        orderBy: { position: "asc" },
      },
      creator: { select: { walletAddress: true } },
    },
  });

  if (
    !survey.creator.walletAddress ||
    survey.creator.walletAddress === "pending"
  ) {
    throw new Error(`Creator wallet not available for survey ${surveyId}`);
  }

  // 2. Build EIP-712 message
  const questions: SurveyQuestion[] = survey.questions.map((q) => ({
    text: q.text,
    questionType: QUESTION_TYPE_INDEX[q.questionType] ?? 0,
    position: q.position,
    required: q.required,
    options: q.options as string[],
    minRating: q.minRating ?? 0,
    maxRating: q.maxRating ?? 0,
    maxLength: q.maxLength ?? 0,
  }));

  const surveyMessage: SurveyMessage = {
    title: survey.title,
    description: survey.description ?? "",
    creator: survey.creator.walletAddress as `0x${string}`,
    slug: survey.slug,
    isPrivate: survey.isPrivate,
    accessMode: survey.accessMode,
    resultsVisibility: survey.resultsVisibility,
    questions,
  };

  const surveyHash = hashSurvey(surveyMessage);

  // Update contentHash early so it's available if the job fails and restarts.
  await db.survey.update({
    where: { id: surveyId },
    data: {
      contentHash: surveyHash,
      verificationStatus: "PENDING",
    },
  });

  // 3. Pin survey JSON to IPFS
  // IPFS schema uses string questionType (Prisma enum) while EIP-712 uses numeric
  const ipfsQuestions = survey.questions.map((q) => ({
    text: q.text,
    questionType: q.questionType,
    position: q.position,
    required: q.required,
    options: q.options as string[],
    minRating: q.minRating ?? 0,
    maxRating: q.maxRating ?? 0,
    maxLength: q.maxLength ?? 0,
  }));

  const ipfsCid = await pinSurvey(
    {
      title: surveyMessage.title,
      description: surveyMessage.description,
      creator: surveyMessage.creator,
      slug: surveyMessage.slug,
      isPrivate: surveyMessage.isPrivate,
      accessMode: surveyMessage.accessMode as "OPEN" | "INVITE_ONLY",
      resultsVisibility: surveyMessage.resultsVisibility as
        | "PUBLIC"
        | "RESPONDENTS"
        | "CREATOR",
      questions: ipfsQuestions,
    },
    surveyHash,
  );

  const creator = survey.creator.walletAddress as `0x${string}`;
  const title = survey.title;
  const slug = survey.slug;
  const questionCount = survey.questions.length;
  const contractAddress = process.env
    .ATTESTLY_CONTRACT_ADDRESS as `0x${string}`;

  // 4-5. Submit tx and wait for confirmation (includes gas ceiling check)
  const { txHash, receipt } = await relayAndConfirm(
    () =>
      getPublicClient().estimateContractGas({
        address: contractAddress,
        abi: attestlyAbi,
        functionName: "publishSurvey",
        args: [
          surveyHash as Hex,
          ipfsCid,
          creator,
          title,
          slug,
          questionCount,
          signature as Hex,
        ],
      }),
    () =>
      publishSurveyOnChain(
        surveyHash as Hex,
        ipfsCid,
        creator,
        title,
        slug,
        questionCount,
        signature as Hex,
      ),
    "publishSurvey",
    `publishSurvey for survey ${surveyId} (hash: ${surveyHash.slice(0, 10)}...)`,
  );

  // 6. Get block timestamp (receipt does not include timestamp)
  const block = await getPublicClient().getBlock({
    blockNumber: receipt.blockNumber,
  });

  // Update Survey record with tx hash and block metadata
  await db.survey.update({
    where: { id: surveyId },
    data: {
      contentHash: surveyHash,
      ipfsCid,
      status: "PUBLISHED",
      publishTxHash: txHash,
      publishBlockNumber: receipt.blockNumber.toString(),
      publishBlockTimestamp: new Date(Number(block.timestamp) * 1000),
      publishedAt: new Date(),
      verificationStatus: "VERIFIED",
    },
  });

  console.log(
    `[PublishSurvey] Survey ${surveyId} published on-chain. Hash: ${surveyHash}, CID: ${ipfsCid}, Tx: ${txHash}`,
  );
}
