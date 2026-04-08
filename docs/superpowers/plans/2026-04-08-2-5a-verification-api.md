# Sub-Plan 2-5a: Verification API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement verification tRPC procedures and cached integrity check logic for on-chain survey verification.

**Architecture:** A `verificationRouter` in `src/server/api/routers/verification.ts` exposes three query procedures for fetching verification status, survey proofs, and response proofs. Checks 1-3 are computed live by reading from the Base contract via ethers.js. Check 4 (Response Integrity) is cached in the database, populated by the `VERIFY_RESPONSES` background job when a survey closes.

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

- [ ] **Step 1: Create the verification lib file** with helper functions for each check
- [ ] **Step 2: Implement `checkSurveyContentIntegrity(surveyHash, surveyData)`**
  - Recompute the EIP-712 hash from the survey content stored in the database
  - Use the same EIP-712 domain and types from the blockchain design spec
  - Compare the recomputed hash to the on-chain `surveyHash` by calling `getSurvey(surveyHash)` on the contract
  - Return `{ status: 'pass' | 'fail', expected: string, actual: string, blockNumber: number }`
- [ ] **Step 3: Implement `checkResponseCount(surveyHash, platformCount)`**
  - Call `getResponseCount(surveyHash)` on the contract
  - Compare with the platform count from the database
  - Return `{ status: 'pass' | 'fail' | 'mismatch', onChainCount: number, platformCount: number }`
- [ ] **Step 4: Implement `checkSurveyClosure(surveyHash)`**
  - Call `getSurvey(surveyHash)` on the contract and check the `closed` flag
  - Query for the `SurveyClosed` event to get the block number and timestamp
  - Return `{ status: 'pass' | 'fail' | 'not_closed', closedAt: number | null, blockNumber: number | null }`
- [ ] **Step 5: Implement `getCachedResponseIntegrity(surveyId)`**
  - Read the cached `VerificationResult` from the database for check 4
  - Return the stored result with `verifiedAt` timestamp
  - If no cached result exists, return `{ status: 'pending', message: 'Verification not yet run' }`
- [ ] **Step 6: Create a contract client helper** that instantiates an ethers.js provider (Base RPC) and contract instance with the Attestly ABI. This should be shared across all live checks.

---

### Task 3: Create the verification router

**Files:**
- Create: `src/server/api/routers/verification.ts`

- [ ] **Step 1: Create the router file** with the tRPC router boilerplate
- [ ] **Step 2: Implement `verification.getStatus`** — public query
  - Input: `{ slug: string }` (Zod validated)
  - Look up the survey by slug, get its `surveyHash`
  - Run all 4 checks in parallel: checks 1-3 live from contract, check 4 from cache
  - Return: `{ surveyHash: string, checks: [{ name: string, status: string, details: object }] }`
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
  - If on-chain reads fail (RPC error): return degraded results with `status: 'unavailable'` rather than throwing
  - If the contract has no data for this survey hash: return `status: 'not_published'`

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
