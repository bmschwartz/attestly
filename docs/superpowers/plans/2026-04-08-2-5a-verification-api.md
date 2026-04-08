# Sub-Plan 2-5a: Verification API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement verification tRPC procedures that return proof data (tx hashes, block numbers, IPFS CIDs, Basescan links) for the verification page. No live hash recomputation in this phase.

**Architecture:** A `verificationRouter` in `src/server/api/routers/verification.ts` exposes three query procedures for fetching verification status, survey proofs, and response proofs. The API returns stored proof data (tx hashes, block numbers, IPFS CIDs) from the database and constructs Basescan links. Live hash recomputation and full integrity checks are deferred to the pre-launch phase (Sub-Plan 2-6) along with open-source verification tools.

**Tech Stack:** tRPC v11, Zod v4, Prisma 7, ethers.js, Base (L2)

**Spec reference:** `docs/superpowers/specs/2026-04-05-blockchain-verification-design.md`

---

## File Structure

- Create: `src/server/api/routers/verification.ts` — verification router with all procedures
- Modify: `src/server/api/root.ts` — register verification router
- Create: `src/server/lib/verification.ts` — verification check logic (pure functions + contract reads)
- Modify: `prisma/schema.prisma` — add VerificationResult model or fields for cached check-4 results
- Create: `src/server/api/routers/__tests__/verification.test.ts` — tests

---

### Task 1: Add VerificationResult storage for cached check-4

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add a `VerificationResult` model** (or fields on Survey) to store the cached result of check 4 (Response Integrity). Include fields:
  - `id` — primary key
  - `surveyId` — foreign key to Survey
  - `check` — enum or string identifying the check type (e.g., `RESPONSE_INTEGRITY`)
  - `status` — enum: `PASS`, `FAIL`, `PENDING`
  - `details` — JSON field for structured result data (response count verified, mismatches found, etc.)
  - `verifiedAt` — timestamp of when the check was last run
  - `createdAt`, `updatedAt`
- [ ] **Step 2: Run `npx prisma generate`** to update the Prisma client
- [ ] **Step 3: Create and apply a migration** with `npx prisma migrate dev --name add-verification-result`

---

### Task 2: Implement verification check logic

**Files:**
- Create: `src/server/lib/verification.ts`

- [ ] **Step 1: Create the verification lib file** with helper functions for assembling proof data

**Note:** This phase does NOT implement live hash recomputation or live on-chain reads for verification checks. Instead, it returns stored proof data from the database. Full verification checks (live hash recomputation, contract reads) are deferred to the pre-launch phase (Sub-Plan 2-6) along with the open-source verification tools.

- [ ] **Step 2: Implement `getSurveyProofData(surveyId)`**
  - Load survey record with `contentHash`, `ipfsCid`, `publishTxHash`, `closeTxHash`, `verificationStatus`
  - Load associated background job records for block numbers and timestamps
  - Construct Basescan links from tx hashes
  - Return `{ surveyHash, ipfsCid, publishTxHash, closeTxHash, blockNumbers, basescanLinks, verificationStatus }`
- [ ] **Step 3: Implement `getResponseProofData(responseId)`**
  - Load response record with `blindedId`, `ipfsCid`, `submitTxHash`, `verificationStatus`
  - Construct Basescan link from tx hash
  - Return `{ blindedId, ipfsCid, submitTxHash, blockNumber, basescanLink, verificationStatus }`
- [ ] **Step 4: Implement `getResponseCountSummary(surveyId)`**
  - Count verified responses from database
  - Return `{ platformCount, verifiedCount }` (no live on-chain comparison in this phase)
- [ ] **Step 5: Implement `getCachedResponseIntegrity(surveyId)`**
  - Read the cached `VerificationResult` from the database for check 4
  - Return the stored result with `verifiedAt` timestamp
  - If no cached result exists, return `{ status: 'pending', message: 'Verification not yet run' }`

---

### Task 3: Create the verification router

**Files:**
- Create: `src/server/api/routers/verification.ts`

- [ ] **Step 1: Create the router file** with the tRPC router boilerplate
- [ ] **Step 2: Implement `verification.getStatus`** — public query
  - Input: `{ slug: string }` (Zod validated)
  - Look up the survey by slug, get its `surveyHash` and verification status
  - Return stored proof data: tx hashes, block numbers, IPFS CIDs, Basescan links, verification status
  - No live on-chain reads or hash recomputation in this phase
  - Handle the case where the survey has no on-chain data yet (`verificationStatus = NONE | PENDING`)
- [ ] **Step 3: Implement `verification.getSurveyProof`** — public query
  - Input: `{ slug: string }` (Zod validated)
  - Look up the survey and its blockchain job records
  - Return tx hashes, block numbers, timestamps, and Basescan links for:
    - `SurveyPublished` event
    - `SurveyClosed` event (if closed)
    - Response count summary
  - Construct Basescan links: `https://basescan.org/tx/{txHash}`
- [ ] **Step 4: Implement `verification.getResponseProof`** — protected query
  - Input: `{ slug: string }` (Zod validated)
  - Auth: must be the respondent (use `ctx.userId` to find their response)
  - Look up the response's blockchain job record
  - Return: tx hash, block number, timestamp, Basescan link, blinded ID, IPFS CID
  - Return null/empty if the user has not responded to this survey
- [ ] **Step 5: Add proper error handling**
  - If the survey does not exist: throw `TRPCError` with `NOT_FOUND`
  - If the survey has no on-chain data: return `status: 'not_published'` with empty proof data
  - No live on-chain reads to fail in this phase -- all data comes from the database

---

### Task 4: Register the verification router

**Files:**
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Import the verification router** from `./routers/verification`
- [ ] **Step 2: Add `verification: verificationRouter`** to the `appRouter` definition

---

### Task 5: Typecheck

- [ ] **Step 1: Run `npx tsc --noEmit`** and fix any type errors
- [ ] **Step 2: Verify the Prisma client types** include the new VerificationResult model
- [ ] **Step 3: Ensure all tRPC procedure return types** are correctly inferred
