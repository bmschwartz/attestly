# Phase 2 Grill-Me Decisions (2026-04-08)

Decisions made during the grill-me session. These require plan updates before implementation.

---

## D1: Client-side hash computation preserves adversary B trust model

**Context:** The server could pre-compute `surveyHash` and return it for signing (Option B), eliminating hash divergence risk, but this lets the platform hand the user a hash of different content than what they entered.

**Decision:** Option A — client computes `hashSurvey()` from its own form state, signs that hash. Server recomputes from DB on enqueue and rejects with a clear error (`"Survey content has changed since you signed. Please reload and try again."`) if they diverge.

**Plan impact:** 2-3b (signing integration) — add server-side hash validation before enqueueing; add `isSaving` guard in step-review.tsx to prevent signing before save completes.

---

## D2: Wallet readiness guard before signing

**Context:** Privy embedded wallets are created during onboarding but not verified. Email-only users may never get a wallet. The `signTypedData` call would throw with no meaningful error.

**Decision:** Disable the Publish/Submit/Close buttons when `wallet?.address` is null or pending. Show a tooltip explaining why. Guard is in the client component, not the server.

**Plan impact:** 2-3b — add wallet readiness check to step-review.tsx, close-survey-dialog.tsx, and response submit component.

---

## D3: `PUBLISHING` gating status — don't go live until fully on-chain

**Context:** Today `survey.publish` transitions DRAFT → PUBLISHED immediately. The survey is live and accepting responses before the on-chain tx and IPFS pin complete. If either fails, responses come in against an unverifiable survey.

**Decision:** Add `PUBLISHING` to `SurveyStatus` enum. Flow:
1. Creator signs → `survey.publish` transitions `DRAFT → PUBLISHING`, enqueues job
2. Survey is NOT visible/respondable while in `PUBLISHING`
3. PUBLISH_SURVEY handler on success: `PUBLISHING → PUBLISHED` (survey goes live)
4. On permanent failure: status stays `PUBLISHING`, creator notified via email

Existing guards (`response.ts:14` checks `status !== "PUBLISHED"`) block responses automatically.

**Plan impact:**
- Schema: add `PUBLISHING` to `SurveyStatus` enum
- 2-3b: `survey.publish` transitions to `PUBLISHING` not `PUBLISHED`
- 2-4b: handler transitions `PUBLISHING → PUBLISHED` on success (already does this conceptually)
- 2-5b or frontend: "Publishing to blockchain..." UI state for the creator
- 2-4b: on permanent failure, enqueue SEND_EMAIL job to notify creator

---

## D4: Extended retry budget for blockchain jobs

**Context:** Current `MAX_RETRIES = 3` with backoff [5s, 30s, 300s] gives ~6 minutes. An IPFS or RPC outage lasting longer permanently fails the job.

**Decision:** Blockchain job types (`PUBLISH_SURVEY`, `SUBMIT_RESPONSE`, `CLOSE_SURVEY`) get `MAX_RETRIES = 10` with extended backoff: [5s, 15s, 30s, 60s, 120s, 300s, 600s, 1800s]. Total window ~50 minutes. User notified only after ALL retries exhausted, not on intermediate failures.

**Plan impact:**
- 2-0 (queue hardening): make `MAX_RETRIES` per-job-type instead of global, or let `failJob` accept an override. Add the extended backoff schedule for blockchain types.
- 2-4b: on permanent failure (retries exhausted), enqueue a SEND_EMAIL job with a "Retry publishing" link that re-triggers the signing flow.

---

## D5: `survey.close` needs EIP-712 signing too

**Context:** The CLOSE_SURVEY handler expects a `signature` in the job payload, but the current `CloseSurveyDialog` calls `survey.close.mutate({ id })` with no signing step.

**Decision:** Add signing to the close flow (same pattern as publish). 2-3b must cover close, not just publish and submit.

**Plan impact:** 2-3b — add `signature` to `survey.close` input, add Privy signing in `close-survey-dialog.tsx`.

---

## D6: Queue hardening as Phase 2 prerequisite (2-0)

**Context:** Two existing bugs: (1) backoff path calls `failJob` which burns retry count, (2) no deferred-release path exists for dependency-blocked jobs.

**Decision:** New sub-plan 2-0 (Queue Hardening) applied before Phase 2. Adds `nextAttemptAt` to schema, `releaseJob` function, fixes `claimNextJob` filter and worker backoff path.

**Plan impact:** Already created as `2026-04-08-2-0-queue-hardening.md` and wired into PLAN.md.

---

## D7: `SUBMITTING` gating status for responses

**Context:** Same pattern as `PUBLISHING` — creator dashboard should show which responses are fully on-chain vs still being anchored. (This decision covers both D7 and former D10, which were identical.)

**Decision:** Add `SUBMITTING` to `ResponseStatus`. Flow: `IN_PROGRESS → SUBMITTING` (after signing + enqueue) → `SUBMITTED` (after on-chain confirmation). Respondent sees "Submitting to blockchain..." state.

**Plan impact:**
- Schema: add `SUBMITTING` to `ResponseStatus` enum
- 2-3b: `response.submit` transitions `IN_PROGRESS → SUBMITTING` not `SUBMITTED`
- 2-4b: SUBMIT_RESPONSE handler transitions `SUBMITTING → SUBMITTED` on success
- Frontend: "Submitting..." state on confirmation page

---

## D8: Use `canonicalize` npm package (not hand-rolled)

**Context:** Plan 2-3 hand-rolls RFC 8785 JCS implementation. An independent verifier using the widely-tested `canonicalize` npm package could produce different bytes on edge cases, breaking CID reproducibility. (This decision covers both D8 and former D11, which were identical.)

**Decision:** Use the `canonicalize` npm package. Remove the hand-rolled `deterministic-json.ts` implementation. Simpler, community-tested, aligns with what external verifiers would use.

**Plan impact:** 2-3 — replace `src/lib/ipfs/deterministic-json.ts` with `import canonicalize from "canonicalize"`. Remove the hand-rolled code. Add `canonicalize` to `package.json`.

---

## D9: Admin key is local-only, not in server env

**Context:** `ADMIN_PRIVATE_KEY` (UUPS proxy owner) is for deploy/upgrade only. Storing it in server env makes a "cold" wallet warm. (This decision covers both D9 and former D12, which were identical.)

**Decision:** Admin key lives in 1Password, pasted into a local `.env` for Hardhat deploy scripts only. Never in the running app's env. Remove `ADMIN_PRIVATE_KEY` from `src/env.js` schema and PLAN.md server env section. Hardhat config reads it from `process.env` directly (not validated by t3-env).

**Plan impact:**
- PLAN.md: remove `ADMIN_PRIVATE_KEY` from env vars, add note about local-only deploy
- 2-1a: Hardhat config reads `ADMIN_PRIVATE_KEY` from `process.env` with a guard (`if (!process.env.ADMIN_PRIVATE_KEY) throw ...` only in deploy scripts)
- 2-4a: do NOT add `ADMIN_PRIVATE_KEY` to `src/env.js`

---

## D13: Privy `useSignTypedData` API confirmed compatible

**Verified:** `@privy-io/react-auth@3.19.0` exports `useSignTypedData` hook. Input is standard EIP-712 `{ types, primaryType, domain, message }`. Returns `{ signature: string }`. Domain uses `chainId?: number` and `verifyingContract?: string` (not viem's `0x${string}` — cast at call site or use Privy's types in the typed data builders).

**Plan impact:** 2-3b — use Privy's `useSignTypedData` hook. Note the type difference in `buildPublishSurveyTypedData`/`buildSubmitResponseTypedData` domain types.

---

## D14: Base Sepolia → mainnet is a clean start

**Verified:** UUPS proxy deploys fresh on mainnet. `surveyHash` is chain-independent (D1/NI-2) so same content produces same hash, but signatures and tx hashes don't transfer. Sepolia is throwaway dev data.

**No plan impact.**

---

## D15: Gas costs — platform absorbs, free tier capped at 50 responses

**Context:** Relayer pays gas for all txs. Free tier: max 5 surveys × 25 responses = 135 txs max (~$1.50 at Base L2 prices). Premium: uncapped responses, gas scales linearly.

**Decision:** Platform cost. No per-tx billing in Phase 2. Relayer wallet needs funding proportional to premium survey volume. Monitor and revisit if gas costs grow.

**No plan impact** (business/ops concern, not architecture).

---

## D16: Add `CLOSING` gating status for survey closure

**Context:** Same pattern as `PUBLISHING` and `SUBMITTING` -- the `survey.close` tRPC procedure should not transition directly to `CLOSED`. The on-chain transaction may fail, and side effects (soft-delete of IN_PROGRESS responses, AI summary enqueue) should only happen after on-chain confirmation.

**Decision (NI-1, Option A):** Add `CLOSING` to `SurveyStatus`. Flow: `PUBLISHED -> CLOSING` (after signing + enqueue in tRPC procedure) -> `CLOSED` (after on-chain confirmation in CLOSE_SURVEY handler). The handler also soft-deletes IN_PROGRESS responses and enqueues AI summary generation -- these side effects are moved from the tRPC procedure to the handler.

**Plan impact:**
- Schema: add `CLOSING` to `SurveyStatus` enum (in 2-3b Task 0 migration)
- 2-3b Task 6: `survey.close` transitions `PUBLISHED -> CLOSING` not `CLOSED`
- 2-4b CLOSE_SURVEY handler: transitions `CLOSING -> CLOSED`, sets `closedAt`, soft-deletes IN_PROGRESS responses, enqueues AI summary

---

## D17: Hide `PUBLISHING` surveys from non-creators

**Context:** A survey in `PUBLISHING` status is not yet live -- the on-chain transaction hasn't confirmed. Non-creator users who happen to know the slug should not see a half-published survey.

**Decision (NI-2, Option A):** Update `getBySlug` in `survey.ts` to return NOT_FOUND for `PUBLISHING` surveys when the requester is not the creator. Only the creator sees the "Publishing..." state.

**Plan impact:** 2-3b Task 1 -- add visibility guard to `getBySlug`.

---

## D18: Count `SUBMITTING` toward free-tier response cap

**Context:** A user could start multiple response submissions while previous ones are still being anchored on-chain. If the free-tier cap query only counts `SUBMITTED` responses, the user could exceed the cap by timing submissions during the `SUBMITTING` window.

**Decision (NI-3, Option A):** Update the free-tier response count query in `response.start` to include `SUBMITTING` status alongside `SUBMITTED`: `status: { in: ["SUBMITTED", "SUBMITTING"] }`.

**Plan impact:** 2-3b Task 2 -- update free-tier cap query.
