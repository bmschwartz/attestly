# Sub-Plan 2-4b: Blockchain Job Handlers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the four blockchain job handlers (PUBLISH_SURVEY, SUBMIT_RESPONSE, CLOSE_SURVEY, VERIFY_RESPONSES) into the existing job queue, replacing placeholder handlers with real implementations that pin to IPFS, compute EIP-712 hashes, and submit transactions.

**Architecture:** Each handler orchestrates: IPFS pinning → EIP-712 hash computation → contract transaction submission → database record update. Job ordering ensures SUBMIT_RESPONSE waits for PUBLISH_SURVEY to complete for the same survey.

**Tech Stack:** viem, Prisma 7, existing job queue (Phase 1 plan 4a), blockchain infrastructure (2-4a), EIP-712 library (2-2), IPFS/Pinata (2-3)

**Spec reference:** `docs/superpowers/specs/2026-04-05-blockchain-verification-design.md`

**Depends on:** Sub-Plan 2-4a (blockchain infra), 2-2 (EIP-712), 2-3 (IPFS/Pinata), 4a (job queue)

---

### Task 6: Create PUBLISH_SURVEY job handler

**Files:**
- Create: `src/server/jobs/handlers/publish-survey.ts`

- [ ] **Step 1: Create the PUBLISH_SURVEY handler**

Create `src/server/jobs/handlers/publish-survey.ts`:

This handler replaces the placeholder and implements the full publish flow:

1. Load the survey + questions from Postgres
2. Build the EIP-712 survey message from the database data
3. Compute the EIP-712 hash (surveyHash)
4. Pin the survey JSON to IPFS via Pinata
5. Submit the `publishSurvey` transaction via the relayer
6. Wait for on-chain confirmation
7. Update the Survey record with contentHash, ipfsCid, publishTxHash, verificationStatus

```typescript
import type { BackgroundJob } from "../../../../generated/prisma";
import { db } from "~/server/db";
import { hashSurvey } from "~/lib/eip712/hash";
import type { SurveyMessage, SurveyQuestion } from "~/lib/eip712/types";
import { pinSurvey } from "~/lib/ipfs/pin-survey";
import { publishSurveyOnChain } from "~/server/blockchain/contract";
import { relayAndConfirm } from "~/server/blockchain/relayer";
import type { Hex } from "viem";

/**
 * Job payload for PUBLISH_SURVEY.
 * Set by the survey.publish tRPC procedure when queuing the job.
 */
interface PublishSurveyPayload {
  surveyId: string;
  signature: string; // Creator's EIP-712 signature (hex)
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
        include: { options: { orderBy: { position: "asc" } } },
      },
      creator: { select: { walletAddress: true } },
    },
  });

  if (!survey.creator.walletAddress || survey.creator.walletAddress === "pending") {
    throw new Error(`Creator wallet not available for survey ${surveyId}`);
  }

  // 2. Build EIP-712 message
  const questions: SurveyQuestion[] = survey.questions.map((q) => ({
    text: q.text,
    questionType: q.type,
    position: q.position,
    required: q.required,
    options: q.options.map((o) => o.text),
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

  // Update status to PENDING
  await db.survey.update({
    where: { id: surveyId },
    data: {
      contentHash: surveyHash,
      verificationStatus: "PENDING",
    },
  });

  // 3. Pin survey JSON to IPFS
  const ipfsCid = await pinSurvey(
    {
      title: surveyMessage.title,
      description: surveyMessage.description,
      creator: surveyMessage.creator,
      slug: surveyMessage.slug,
      isPrivate: surveyMessage.isPrivate,
      accessMode: surveyMessage.accessMode as "OPEN" | "INVITE_ONLY",
      resultsVisibility: surveyMessage.resultsVisibility as "PUBLIC" | "RESPONDENTS" | "CREATOR",
      questions,
    },
    surveyHash,
  );

  // 4-5. Submit tx and wait for confirmation
  const { txHash } = await relayAndConfirm(
    () =>
      publishSurveyOnChain(
        surveyHash as Hex,
        ipfsCid,
        survey.creator.walletAddress as `0x${string}`,
        signature as Hex,
      ),
    `publishSurvey for survey ${surveyId} (hash: ${surveyHash.slice(0, 10)}...)`,
  );

  // 6. Update Survey record
  await db.survey.update({
    where: { id: surveyId },
    data: {
      contentHash: surveyHash,
      ipfsCid,
      publishTxHash: txHash,
      verificationStatus: "VERIFIED",
    },
  });

  console.log(
    `[PublishSurvey] Survey ${surveyId} published on-chain. Hash: ${surveyHash}, CID: ${ipfsCid}, Tx: ${txHash}`,
  );
}
```

Key notes:
- The `signature` comes from the client-side signing (done when the user clicks "Publish"). It's stored in the job payload.
- Survey fields are mapped from the Prisma model to the EIP-712 SurveyMessage format. The mapping handles the question options (stored as separate records in Prisma, flattened to string arrays for EIP-712).
- `verificationStatus` transitions: NONE -> PENDING (after hash computed) -> VERIFIED (after tx confirmed). If the job fails, the status stays PENDING and the job retries.
- The `minRating`, `maxRating`, and `maxLength` fields default to 0 if null (matching the EIP-712 uint type defaults).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

If there are type mismatches with the Prisma model fields (e.g., `minRating` vs `minValue`, `type` vs `questionType`), adjust the mapping to match the actual Prisma schema field names. The EIP-712 field names must stay as defined in the spec.

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/jobs/handlers/publish-survey.ts
git commit -m "feat: implement PUBLISH_SURVEY job handler (IPFS pin + on-chain tx)"
```

---

### Task 7: Create SUBMIT_RESPONSE job handler

**Files:**
- Create: `src/server/jobs/handlers/submit-response.ts`

- [ ] **Step 1: Create the SUBMIT_RESPONSE handler**

Create `src/server/jobs/handlers/submit-response.ts`:

This handler implements the full response submission flow:

1. Load the response + answers from Postgres
2. Load the survey's contentHash (must exist -- PUBLISH_SURVEY must have completed)
3. Compute the blinded ID from the respondent's wallet + surveyHash
4. Pin the response JSON to IPFS
5. Submit the `submitResponse` transaction via the relayer
6. Wait for confirmation
7. Update the Response record with blindedId, ipfsCid, submitTxHash, verificationStatus

```typescript
import type { BackgroundJob } from "../../../../generated/prisma";
import { db } from "~/server/db";
import { computeBlindedId } from "~/lib/eip712/blinded-id";
import { pinResponse } from "~/lib/ipfs/pin-response";
import { submitResponseOnChain } from "~/server/blockchain/contract";
import { relayAndConfirm } from "~/server/blockchain/relayer";
import type { Hex } from "viem";

/**
 * Job payload for SUBMIT_RESPONSE.
 * Set by the response.submit tRPC procedure when queuing the job.
 */
interface SubmitResponsePayload {
  responseId: string;
  signature: string; // Respondent's EIP-712 signature (hex)
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
        orderBy: { questionId: "asc" },
        include: {
          question: { select: { position: true, type: true } },
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

  if (!response.respondent.walletAddress || response.respondent.walletAddress === "pending") {
    throw new Error(`Respondent wallet not available for response ${responseId}`);
  }

  // 3. Compute blinded ID
  const blindedId = computeBlindedId(
    response.respondent.walletAddress as `0x${string}`,
    surveyHash as `0x${string}`,
  );

  // Update status to PENDING
  await db.response.update({
    where: { id: responseId },
    data: {
      blindedId,
      verificationStatus: "PENDING",
    },
  });

  // 4. Pin response JSON to IPFS
  const answers = response.answers.map((a) => ({
    questionIndex: a.question.position,
    questionType: a.question.type,
    value: a.value,
  }));

  const ipfsCid = await pinResponse({
    surveyHash,
    blindedId,
    answers,
    signature,
  });

  // 5-6. Submit tx and wait for confirmation
  const { txHash } = await relayAndConfirm(
    () =>
      submitResponseOnChain(
        surveyHash as Hex,
        blindedId as Hex,
        ipfsCid,
        signature as Hex,
      ),
    `submitResponse for response ${responseId} (survey: ${surveyHash.slice(0, 10)}...)`,
  );

  // 7. Update Response record
  await db.response.update({
    where: { id: responseId },
    data: {
      blindedId,
      ipfsCid,
      submitTxHash: txHash,
      verificationStatus: "VERIFIED",
    },
  });

  console.log(
    `[SubmitResponse] Response ${responseId} submitted on-chain. BlindedId: ${blindedId.slice(0, 10)}..., CID: ${ipfsCid}, Tx: ${txHash}`,
  );
}
```

Key notes:
- If `contentHash` is null, the survey hasn't been published on-chain yet. The job throws an error and retries (the PUBLISH_SURVEY job should complete before retries are exhausted, thanks to job ordering -- see Task 9).
- Answer mapping: `questionIndex` uses the question's `position` field, `questionType` uses the question's `type` field, and `value` is the stored answer value.
- The blinded ID is computed server-side (same computation as on-chain) and stored in both the Response record and the IPFS JSON.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/jobs/handlers/submit-response.ts
git commit -m "feat: implement SUBMIT_RESPONSE job handler (blinded ID + IPFS + on-chain tx)"
```

---

### Task 8: Create CLOSE_SURVEY and VERIFY_RESPONSES job handlers

**Files:**
- Create: `src/server/jobs/handlers/close-survey.ts`
- Create: `src/server/jobs/handlers/verify-responses.ts`

- [ ] **Step 1: Create the CLOSE_SURVEY handler**

Create `src/server/jobs/handlers/close-survey.ts`:

```typescript
import type { BackgroundJob } from "../../../../generated/prisma";
import { db } from "~/server/db";
import { closeSurveyOnChain } from "~/server/blockchain/contract";
import { relayAndConfirm } from "~/server/blockchain/relayer";
import { createJob } from "~/server/jobs/queue";
import type { Hex } from "viem";

/**
 * Job payload for CLOSE_SURVEY.
 */
interface CloseSurveyPayload {
  surveyId: string;
  signature: string; // Creator's EIP-712 close signature (hex)
}

/**
 * Handle a CLOSE_SURVEY background job.
 *
 * Flow:
 * 1. Load survey from DB (must have contentHash from PUBLISH_SURVEY)
 * 2. Submit closeSurvey tx to contract via relayer
 * 3. Wait for confirmation
 * 4. Update Survey record (closeTxHash)
 * 5. Queue a VERIFY_RESPONSES job to run the full integrity check
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

  // 2-3. Submit tx and wait for confirmation
  const { txHash } = await relayAndConfirm(
    () => closeSurveyOnChain(surveyHash as Hex, signature as Hex),
    `closeSurvey for survey ${surveyId} (hash: ${surveyHash.slice(0, 10)}...)`,
  );

  // 4. Update Survey record
  await db.survey.update({
    where: { id: surveyId },
    data: {
      closeTxHash: txHash,
    },
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
```

- [ ] **Step 2: Create the VERIFY_RESPONSES handler**

Create `src/server/jobs/handlers/verify-responses.ts`:

This handler runs a full response integrity check after a survey is closed. It verifies that:
1. All on-chain response CIDs exist on IPFS
2. All blinded IDs are unique
3. Response count matches

The result is cached in the database for display on the verification page.

```typescript
import type { BackgroundJob } from "../../../../generated/prisma";
import { db } from "~/server/db";
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
 * Runs a full response integrity check (Check 4 from the verification spec):
 * 1. Count on-chain responses via getResponseCount
 * 2. Load all Response records for this survey with IPFS CIDs
 * 3. Verify each IPFS CID is accessible
 * 4. Verify blinded ID uniqueness
 * 5. Verify counts match (DB vs on-chain)
 * 6. Cache the verification result in the database
 *
 * This runs once when the survey is closed. The result is displayed
 * on the verification page as "Last verified: {date}".
 */
export async function handleVerifyResponses(job: BackgroundJob): Promise<void> {
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

  // 6. Cache the result
  // Store as a JSON field on the survey or a separate verification record.
  // For now, log the result. The verification caching schema will be
  // refined when the verification page is implemented.
  const passed = errors.length === 0;

  console.log(
    `[VerifyResponses] Survey ${surveyId}: ${passed ? "PASSED" : "FAILED"}`,
  );
  console.log(
    `[VerifyResponses] DB responses: ${dbCount}, On-chain: ${onChainCount.toString()}, IPFS verified: ${ipfsVerified}`,
  );
  if (errors.length > 0) {
    console.log(`[VerifyResponses] Errors:`, errors);
  }

  // TODO: Store verification result in a dedicated DB field or table
  // when the verification page plan is implemented. For now, the
  // console output serves as the verification record.
}
```

Key notes:
- IPFS verification is sequential to avoid overwhelming the gateway. For large surveys, this could be parallelized with concurrency limits (future optimization).
- The verification result caching is a TODO -- the exact schema depends on the verification page implementation (a future sub-plan). The handler logs results for now.
- `getResponseCountOnChain` returns a `bigint` (standard for EVM uint256 values).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/jobs/handlers/close-survey.ts src/server/jobs/handlers/verify-responses.ts
git commit -m "feat: implement CLOSE_SURVEY and VERIFY_RESPONSES job handlers"
```

---

### Task 9: Wire job handlers and implement job ordering

**Files:**
- Modify: `src/server/jobs/handlers.ts`

- [ ] **Step 1: Replace placeholder handlers with real implementations**

Update `src/server/jobs/handlers.ts` to import and register the real handlers:

Replace the placeholder registrations for PUBLISH_SURVEY, SUBMIT_RESPONSE, CLOSE_SURVEY, and VERIFY_RESPONSES with the real handler imports:

```typescript
import type { BackgroundJob } from "../../../generated/prisma";
import { handleGenerateAiSummary } from "./handlers/generate-ai-summary";
import { handlePublishSurvey } from "./handlers/publish-survey";
import { handleSubmitResponse } from "./handlers/submit-response";
import { handleCloseSurvey } from "./handlers/close-survey";
import { handleVerifyResponses } from "./handlers/verify-responses";

// ... (keep the registry functions: registerHandler, getHandler, hasHandler unchanged)

// Replace placeholder handlers with real implementations
registerHandler("PUBLISH_SURVEY", handlePublishSurvey);
registerHandler("SUBMIT_RESPONSE", handleSubmitResponse);
registerHandler("CLOSE_SURVEY", handleCloseSurvey);
registerHandler("VERIFY_RESPONSES", handleVerifyResponses);

// Keep existing handlers
registerHandler("SEND_EMAIL", placeholderHandler("SEND_EMAIL"));
registerHandler("GENERATE_AI_SUMMARY", async (job) => {
  const payload = job.payload as {
    surveyId: string;
    focusPrompt?: string;
    questionId?: string;
  };
  await handleGenerateAiSummary(payload);
});
```

- [ ] **Step 2: Implement job ordering in the worker**

The spec requires:
- `SUBMIT_RESPONSE` jobs wait for the survey's `PUBLISH_SURVEY` job to complete
- `CLOSE_SURVEY` jobs wait for all pending `SUBMIT_RESPONSE` jobs to complete

Modify the `claimNextJob` logic in `src/server/jobs/queue.ts` (or add a pre-check in the worker) to skip jobs whose dependencies haven't been met:

Add a new function to `src/server/jobs/queue.ts`:

```typescript
/**
 * Check if a job's dependencies are satisfied.
 *
 * - SUBMIT_RESPONSE: requires PUBLISH_SURVEY for the same survey to be COMPLETED
 * - CLOSE_SURVEY: requires all SUBMIT_RESPONSE jobs for the same survey to be COMPLETED
 * - All other job types: no dependencies
 *
 * @returns true if the job can be processed, false if it should be skipped
 */
export async function areDependenciesMet(job: BackgroundJob): Promise<boolean> {
  if (job.type === "SUBMIT_RESPONSE" && job.surveyId) {
    // Check if PUBLISH_SURVEY is completed for this survey
    const publishJob = await db.backgroundJob.findFirst({
      where: {
        type: "PUBLISH_SURVEY",
        surveyId: job.surveyId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
    // If a PUBLISH_SURVEY job is still pending/processing, skip this job
    if (publishJob) return false;
  }

  if (job.type === "CLOSE_SURVEY" && job.surveyId) {
    // Check if all SUBMIT_RESPONSE jobs are completed for this survey
    const pendingResponses = await db.backgroundJob.findFirst({
      where: {
        type: "SUBMIT_RESPONSE",
        surveyId: job.surveyId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
    if (pendingResponses) return false;
  }

  return true;
}
```

Then update the worker's `processNextJob` function in `src/server/jobs/worker.ts` to call `areDependenciesMet` after claiming a job. If dependencies are not met, release the job back to PENDING:

```typescript
// After claiming the job, check dependencies
const depsMet = await areDependenciesMet(job);
if (!depsMet) {
  // Release the job -- set it back to PENDING without incrementing retry count
  await db.backgroundJob.update({
    where: { id: job.id },
    data: { status: "PENDING" },
  });
  console.log(
    `[Worker] Job ${job.id} (${job.type}) skipped — dependencies not met`,
  );
  return true; // return true to continue processing other jobs
}
```

Import `areDependenciesMet` from `./queue` and `db` from `~/server/db` in the worker module.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/jobs/handlers.ts src/server/jobs/queue.ts src/server/jobs/worker.ts
git commit -m "feat: wire real job handlers and implement job ordering (SUBMIT_RESPONSE waits for PUBLISH_SURVEY)"
```

---

### Task 10: Final typecheck and verification

- [ ] **Step 1: Run full typecheck**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 2: Run all tests**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm test
```

Expected: all existing tests pass. New handler tests are not required for this plan (they require integration testing with a running contract, which is a future task).

- [ ] **Step 3: Verify the worker starts**

```bash
cd /Users/bmschwartz/Development/attestly && timeout 5 pnpm worker || true
```

Expected: worker starts without import errors. It will log handler registration and begin polling.

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `pnpm typecheck` -- no TypeScript errors
- [ ] `pnpm test` -- all existing tests pass
- [ ] `pnpm worker` -- starts without errors
- [ ] `src/env.js` -- has BASE_RPC_URL, RELAYER_PRIVATE_KEY, ATTESTLY_CONTRACT_ADDRESS as optional server-side env vars
- [ ] `src/server/blockchain/provider.ts` -- exports `getPublicClient`, `getWalletClient`, `getRelayerAddress` with lazy initialization
- [ ] `src/server/blockchain/abi.ts` -- exports `attestlyAbi` matching the IAttestly interface
- [ ] `src/server/blockchain/contract.ts` -- exports typed wrappers: `publishSurveyOnChain`, `submitResponseOnChain`, `closeSurveyOnChain`, `getSurveyOnChain`, `isResponseSubmittedOnChain`, `getResponseCountOnChain`
- [ ] `src/server/blockchain/relayer.ts` -- exports `waitForTransaction`, `relayAndConfirm`, `checkGasCeiling`, `isContractRevert`, `PermanentTransactionError`, `GasCeilingExceededError`; gas ceiling rejects above 10x expected; contract reverts are permanent FAILED; network errors are transient retry
- [ ] `src/server/jobs/handlers/publish-survey.ts` -- full flow: load survey -> hash -> pin IPFS -> submit tx -> update DB
- [ ] `src/server/jobs/handlers/submit-response.ts` -- full flow: load response -> compute blinded ID -> pin IPFS -> submit tx -> update DB
- [ ] `src/server/jobs/handlers/close-survey.ts` -- submit closeSurvey tx -> update DB -> queue VERIFY_RESPONSES
- [ ] `src/server/jobs/handlers/verify-responses.ts` -- check IPFS CIDs, blinded ID uniqueness, count match
- [ ] `src/server/jobs/handlers.ts` -- real handlers registered (no more placeholders for blockchain job types)
- [ ] `src/server/jobs/queue.ts` -- has `areDependenciesMet` function for job ordering
- [ ] `src/server/jobs/worker.ts` -- checks dependencies before processing jobs
- [ ] SUBMIT_RESPONSE jobs wait for PUBLISH_SURVEY to complete for the same survey
- [ ] CLOSE_SURVEY jobs wait for all SUBMIT_RESPONSE jobs to complete for the same survey
