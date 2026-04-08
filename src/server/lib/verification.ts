import type { PrismaClient } from "../../../generated/prisma";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a chain-aware Basescan URL for a transaction hash.
 * Uses NEXT_PUBLIC_CHAIN_ID to determine mainnet vs Sepolia.
 */
export function getBasescanUrl(txHash: string): string {
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID;
  const baseUrl =
    chainId === "8453"
      ? "https://basescan.org"
      : "https://sepolia.basescan.org";
  return `${baseUrl}/tx/${txHash}`;
}

// ---------------------------------------------------------------------------
// Survey proof data
// ---------------------------------------------------------------------------

export async function getSurveyProofData(surveyId: string, db: PrismaClient) {
  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      contentHash: true,
      ipfsCid: true,
      publishTxHash: true,
      publishBlockNumber: true,
      publishBlockTimestamp: true,
      closeTxHash: true,
      closeBlockNumber: true,
      closeBlockTimestamp: true,
      verificationStatus: true,
    },
  });

  if (!survey) return null;

  const basescanLinks: Record<string, string> = {};
  if (survey.publishTxHash) {
    basescanLinks.publish = getBasescanUrl(survey.publishTxHash);
  }
  if (survey.closeTxHash) {
    basescanLinks.close = getBasescanUrl(survey.closeTxHash);
  }

  return {
    surveyHash: survey.contentHash,
    ipfsCid: survey.ipfsCid,
    publishTxHash: survey.publishTxHash,
    publishBlockNumber: survey.publishBlockNumber,
    publishBlockTimestamp: survey.publishBlockTimestamp,
    closeTxHash: survey.closeTxHash,
    closeBlockNumber: survey.closeBlockNumber,
    closeBlockTimestamp: survey.closeBlockTimestamp,
    basescanLinks,
    verificationStatus: survey.verificationStatus,
  };
}

// ---------------------------------------------------------------------------
// Response proof data
// ---------------------------------------------------------------------------

export async function getResponseProofData(
  responseId: string,
  db: PrismaClient,
) {
  const response = await db.response.findUnique({
    where: { id: responseId },
    select: {
      id: true,
      blindedId: true,
      ipfsCid: true,
      submitTxHash: true,
      submitBlockNumber: true,
      submitBlockTimestamp: true,
      verificationStatus: true,
    },
  });

  if (!response) return null;

  const basescanLink = response.submitTxHash
    ? getBasescanUrl(response.submitTxHash)
    : null;

  return {
    blindedId: response.blindedId,
    ipfsCid: response.ipfsCid,
    submitTxHash: response.submitTxHash,
    submitBlockNumber: response.submitBlockNumber,
    submitBlockTimestamp: response.submitBlockTimestamp,
    basescanLink,
    verificationStatus: response.verificationStatus,
  };
}

// ---------------------------------------------------------------------------
// Response count summary
// ---------------------------------------------------------------------------

export async function getResponseCountSummary(
  surveyId: string,
  db: PrismaClient,
) {
  const [platformCount, verifiedCount] = await Promise.all([
    db.response.count({
      where: { surveyId, status: "SUBMITTED" },
    }),
    db.response.count({
      where: { surveyId, status: "SUBMITTED", verificationStatus: "VERIFIED" },
    }),
  ]);

  return { platformCount, verifiedCount };
}

// ---------------------------------------------------------------------------
// Cached response integrity (VerificationResult)
// ---------------------------------------------------------------------------

export async function getCachedResponseIntegrity(
  surveyId: string,
  db: PrismaClient,
) {
  const result = await db.verificationResult.findUnique({
    where: { surveyId },
  });

  if (!result) {
    return {
      status: "pending" as const,
      message: "Verification not yet run",
    };
  }

  return {
    status: "complete" as const,
    passed: result.passed,
    dbResponseCount: result.dbResponseCount,
    onChainResponseCount: result.onChainResponseCount,
    ipfsVerifiedCount: result.ipfsVerifiedCount,
    errors: result.errors,
    verifiedAt: result.verifiedAt,
  };
}
