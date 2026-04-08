import type { BackgroundJob } from "../../../../generated/prisma";
import { db } from "~/server/jobs/db";
import { getResponseCountOnChain } from "~/server/blockchain/contract";
import { getContent } from "~/lib/ipfs/pinata";
import type { Hex } from "viem";

/**
 * Job payload for VERIFY_RESPONSES.
 */
interface VerifyResponsesPayload {
  surveyId: string;
}

/**
 * Handle a VERIFY_RESPONSES background job.
 *
 * Runs a full response integrity check:
 * 1. Count on-chain responses via getResponseCount
 * 2. Load all Response records for this survey with IPFS CIDs
 * 3. Verify each IPFS CID is accessible
 * 4. Verify blinded ID uniqueness
 * 5. Verify counts match (DB vs on-chain)
 * 6. Cache the verification result in the database
 */
export async function handleVerifyResponses(
  job: BackgroundJob,
): Promise<void> {
  const payload = job.payload as unknown as VerifyResponsesPayload;
  const { surveyId } = payload;

  // Load survey
  const survey = await db.survey.findUniqueOrThrow({
    where: { id: surveyId },
    select: { id: true, contentHash: true },
  });

  if (!survey.contentHash) {
    throw new Error(`Survey ${surveyId} has no contentHash.`);
  }

  const surveyHash = survey.contentHash as Hex;

  // 1. Get on-chain response count
  const onChainCount = await getResponseCountOnChain(surveyHash);

  // 2. Load all verified responses from DB
  const responses = await db.response.findMany({
    where: {
      surveyId,
      verificationStatus: "VERIFIED",
    },
    select: {
      id: true,
      blindedId: true,
      ipfsCid: true,
    },
  });

  const dbCount = responses.length;
  const errors: string[] = [];

  // 3. Verify IPFS CID accessibility for each response
  let ipfsVerified = 0;
  for (const response of responses) {
    if (!response.ipfsCid) {
      errors.push(`Response ${response.id}: missing IPFS CID`);
      continue;
    }

    try {
      await getContent(response.ipfsCid);
      ipfsVerified++;
    } catch {
      errors.push(
        `Response ${response.id}: IPFS CID ${response.ipfsCid} not accessible`,
      );
    }
  }

  // 4. Verify blinded ID uniqueness
  const blindedIds = responses
    .map((r) => r.blindedId)
    .filter((id): id is string => id !== null);
  const uniqueBlindedIds = new Set(blindedIds);
  if (uniqueBlindedIds.size !== blindedIds.length) {
    errors.push(
      `Duplicate blinded IDs detected: ${blindedIds.length} total, ${uniqueBlindedIds.size} unique`,
    );
  }

  // 5. Verify counts match
  if (BigInt(dbCount) !== onChainCount) {
    errors.push(
      `Count mismatch: ${dbCount} in DB, ${onChainCount.toString()} on-chain`,
    );
  }

  // 6. Store the result in the VerificationResult table
  const passed = errors.length === 0;

  await db.verificationResult.upsert({
    where: { surveyId },
    create: {
      surveyId,
      passed,
      dbResponseCount: dbCount,
      onChainResponseCount: Number(onChainCount),
      ipfsVerifiedCount: ipfsVerified,
      errors,
      verifiedAt: new Date(),
    },
    update: {
      passed,
      dbResponseCount: dbCount,
      onChainResponseCount: Number(onChainCount),
      ipfsVerifiedCount: ipfsVerified,
      errors,
      verifiedAt: new Date(),
    },
  });

  console.log(
    `[VerifyResponses] Survey ${surveyId}: ${passed ? "PASSED" : "FAILED"}`,
  );
  console.log(
    `[VerifyResponses] DB responses: ${dbCount}, On-chain: ${onChainCount.toString()}, IPFS verified: ${ipfsVerified}`,
  );
  if (errors.length > 0) {
    console.log(`[VerifyResponses] Errors:`, errors);
  }
}
