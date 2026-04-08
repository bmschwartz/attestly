# Sub-Plan 2-3b: Signing Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thread EIP-712 signatures from the client through the tRPC layer into the blockchain job queue. After this sub-plan, the `survey.publish` and `response.submit` tRPC procedures accept a caller-provided EIP-712 signature and store it in the job payload, so the job handlers in 2-4b have everything they need to submit on-chain transactions.

**Architecture:** The client (browser) signs via Privy embedded wallet before calling the tRPC procedure. The server never holds a signing key for user data — it only relays. This preserves the adversary B trust model: users who distrust the platform can verify their signature is exactly what was submitted on-chain.

**Tech Stack:** tRPC v11, viem (EIP-712), Privy embedded wallet, Next.js 16 client components

**Spec reference:** `docs/superpowers/specs/2026-04-05-blockchain-verification-design.md`

**Depends on:** Sub-Plan 2-2 (EIP-712 library for hash/sign functions), 2-3 (IPFS / Pinata), Phase 1 plan 4a (job queue)

---

## Overview

The signing integration has two parts:

1. **Server side** — Modify `survey.publish`, `response.submit`, and `survey.close` tRPC procedures to:
   - Accept a `signature` field in the input
   - Store the signature in the `BackgroundJob.payload` (alongside `surveyId`/`responseId`)
   - Validate the signature server-side before enqueuing (optional but recommended)

2. **Client side** — Modify the publish survey, submit response, and close survey call sites to:
   - Compute the EIP-712 hash using the `hashSurvey`/`hashAnswers` functions
   - Sign the hash using Privy's `signTypedData` (or `useSignTypedData` hook)
   - Pass the resulting signature to the tRPC mutation

**Gating pattern (D3/D7):** The tRPC procedures do NOT transition directly to the final status (`PUBLISHED`, `SUBMITTED`). Instead, they transition to an intermediate status (`PUBLISHING`, `SUBMITTING`) to indicate that the on-chain transaction is pending. The job handler (in 2-4b) transitions to the final status on success, or rolls back on failure. This prevents the UI from showing a "published" state before the transaction is confirmed on-chain.

---

## File Structure

- Modify: `src/server/api/routers/survey.ts` — add `signature` field to `publish` input
- Modify: `src/server/api/routers/response.ts` — add `signature` field to `submit` input
- Modify: client component that calls `survey.publish` — add EIP-712 signing step before mutation
- Modify: client component that calls `response.submit` — add EIP-712 signing step before mutation
- Modify: `src/server/api/routers/survey.ts` — add `signature` field to `close` input
- Modify: client component `close-survey-dialog.tsx` — add EIP-712 signing step before close mutation
- Modify: `src/env.js` — ensure `NEXT_PUBLIC_ATTESTLY_CONTRACT_ADDRESS` and `NEXT_PUBLIC_CHAIN_ID` are present (added in 2-4a)

---

### Task 0: Schema migration for Phase 2 statuses

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add gating statuses to Prisma enums**

Add the following values to the existing enums in `prisma/schema.prisma`:

- `SurveyStatus`: add `PUBLISHING` (between `DRAFT` and `PUBLISHED`) and `CLOSING` (between `PUBLISHED` and `CLOSED`)
- `ResponseStatus`: add `SUBMITTING` (between `IN_PROGRESS` and `SUBMITTED`)

These intermediate statuses gate visibility and prevent premature transitions while on-chain transactions are pending.

- [ ] **Step 2: Run the migration**

```bash
pnpm prisma migrate dev --name phase2_status_enums
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm typecheck
```

**Note:** Block number/timestamp fields and the `VerificationResult` model are added later in Sub-Plan 2-4b's schema migration. Do not add them here.

---

### Task 1: Update `survey.publish` tRPC procedure

**Files:**
- Modify: `src/server/api/routers/survey.ts`

- [ ] **Step 1: Add `signature` and `surveyHash` to the `publish` input schema**

Find the `survey.publish` procedure and extend its Zod input to include:
```typescript
signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Must be a valid EIP-712 signature"),
surveyHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a valid bytes32 hex string"),
```

**Status transition (D3):** The procedure should transition the survey status from `DRAFT` to `PUBLISHING` (NOT `PUBLISHED`). The job handler in 2-4b will transition `PUBLISHING -> PUBLISHED` on success, or roll back to `DRAFT` on failure.

**Visibility guard (NI-2):** Update `getBySlug` in `survey.ts` to return NOT_FOUND for `PUBLISHING` surveys when the requester is not the creator. Only the creator sees the "Publishing..." state. Non-creators should not see a half-published survey.

- [ ] **Step 2: Pass `signature` into the job payload**

In the `createJob` call within `survey.publish`, update the payload to include the signature:
```typescript
await createJob({
  type: "PUBLISH_SURVEY",
  surveyId: survey.id,
  payload: {
    surveyId: survey.id,
    signature: input.signature,
  },
});
```

- [ ] **Step 3: Server-side hash validation (D1)**

Before enqueuing the job, recompute `surveyHash` from the DB and compare it to the client-provided `input.surveyHash`. If they differ, return an error. This preserves the adversary B trust model: the client computes the hash and signs it, but the server validates it matches current DB state.

```typescript
import { hashSurvey, buildSurveyMessage } from "~/lib/eip712/hash";

const serverSurveyMessage = buildSurveyMessage(survey, questions);
const serverHash = hashSurvey(serverSurveyMessage);

if (serverHash !== input.surveyHash) {
  throw new TRPCError({
    code: "CONFLICT",
    message: "Survey content has changed since you signed. Please reload and try again.",
  });
}
```

- [ ] **Step 3b: Add `buildSurveyMessage` helper**

A `buildSurveyMessage` helper function should be added to `src/lib/eip712/hash.ts` (or `types.ts`) that constructs a `SurveyMessage` from DB/form data. This avoids duplicating the mapping logic across the tRPC procedure and job handler.

```typescript
export function buildSurveyMessage(
  survey: {
    title: string;
    description: string;
    slug: string;
    isPrivate: boolean;
    accessMode: string;
    resultsVisibility: string;
  },
  creator: `0x${string}`,
  questions: SurveyQuestion[],
): SurveyMessage
```

This function is used in Step 3 above (`buildSurveyMessage(survey, questions)`) and in the PUBLISH_SURVEY job handler (2-4b).

- [ ] **Step 4: (Optional) Validate signature server-side before enqueuing**

To catch bad signatures early (before wasting a job slot), optionally verify the signature server-side using viem:

```typescript
import { verifyTypedData } from "viem";
import { buildPublishSurveyTypedData } from "~/lib/eip712/domain";
import { hashSurvey } from "~/lib/eip712/hash";

// Compute the hash and build the typed data for verification
const surveyMessage = buildSurveyMessage(survey, questions);
const surveyHash = hashSurvey(surveyMessage);

const typedData = buildPublishSurveyTypedData({
  surveyHash,
  title: survey.title,
  slug: survey.slug,
  questionCount: questions.length,
  creator: creatorWalletAddress as `0x${string}`,
});

const valid = await verifyTypedData({
  ...typedData,
  address: creatorWalletAddress as `0x${string}`,
  signature: input.signature as `0x${string}`,
});

if (!valid) {
  throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid EIP-712 signature" });
}
```

This step is optional in this phase but strongly recommended to prevent bad data reaching the job queue.

---

### Task 2: Update `response.submit` tRPC procedure

**Files:**
- Modify: `src/server/api/routers/response.ts`

- [ ] **Step 1: Add `signature` to the `submit` input schema**

Find the `response.submit` procedure and extend its Zod input:
```typescript
signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Must be a valid EIP-712 signature"),
```

**Status transition (D7):** The procedure should transition the response status from `IN_PROGRESS` to `SUBMITTING` (NOT `SUBMITTED`). The job handler in 2-4b will transition `SUBMITTING -> SUBMITTED` on success, or roll back to `IN_PROGRESS` on failure.

**Free-tier cap (NI-3):** Update the free-tier response count query in `response.start` (or wherever the cap is checked) to include `SUBMITTING` status alongside `SUBMITTED`: `status: { in: ["SUBMITTED", "SUBMITTING"] }`. This prevents users from bypassing the cap by submitting while a previous response is still being anchored on-chain.

- [ ] **Step 2: Pass `signature` into the job payload**

```typescript
await createJob({
  type: "SUBMIT_RESPONSE",
  surveyId: response.surveyId,
  payload: {
    responseId: response.id,
    signature: input.signature,
  },
});
```

---

### Task 3: Update the publish survey client component

**Files:**
- Modify: client component calling `trpc.survey.publish.useMutation()` (locate via grep for `survey.publish`)

- [ ] **Step 1: Locate the call site**

```bash
grep -r "survey.publish\|publishSurvey" src/app --include="*.tsx" -l
```

- [ ] **Step 2: Import signing utilities**

```typescript
import { useSignTypedData } from "@privy-io/react-auth"; // or privy's hook for signTypedData
import { hashSurvey } from "~/lib/eip712/hash";
import { buildPublishSurveyTypedData } from "~/lib/eip712/domain";
import { buildSurveyMessage } from "~/lib/eip712/types"; // helper to build from form data
```

- [ ] **Step 3: Add signing before the tRPC mutation call**

Before calling `publishMutation.mutate(...)`, add:

```typescript
// 1. Build the survey message from form data
const surveyMessage = buildSurveyMessage(formData, walletAddress);

// 2. Compute the content hash
const surveyHash = hashSurvey(surveyMessage);

// 3. Build EIP-712 typed data for signing
const typedData = buildPublishSurveyTypedData({
  surveyHash,
  title: formData.title,
  slug: formData.slug,
  questionCount: formData.questions.length,
  creator: walletAddress as `0x${string}`,
});

// 4. Sign via Privy embedded wallet
const signature = await signTypedData(typedData);

// 5. Call tRPC with signature
publishMutation.mutate({ ...formData, signature });
```

Key notes:
- `signTypedData` is Privy's method for EIP-712 signing with embedded wallets. The exact import/hook depends on the Privy version used in this project — check existing Privy usage in the codebase.
- The signing step is async. Wrap in try/catch and surface errors to the user (e.g., "Signing rejected").
- The `buildPublishSurveyTypedData` function should be added to `src/lib/eip712/domain.ts` as part of this sub-plan if not already present (it builds the full EIP-712 typed data object including domain, types, and message for `signTypedData`).

**Wallet readiness guard (D2):** Disable the Publish button when `wallet?.address` is null. Show a tooltip "Wallet not ready". Import wallet state from Privy (e.g., `usePrivy()` or `useWallets()`).

**isSaving guard (D1):** The Publish button must also be disabled while `saveCurrentState` is in-flight. The `useSurveyBuilder` hook should expose an `isSaving` boolean, and `StepReview` should check it. This prevents the user from publishing stale content that hasn't been persisted to the DB yet.

---

### Task 4: Update the submit response client component

**Files:**
- Modify: client component calling `trpc.response.submit.useMutation()` (locate via grep)

- [ ] **Step 1: Locate the call site**

```bash
grep -r "response.submit\|submitResponse" src/app --include="*.tsx" -l
```

- [ ] **Step 2: Add signing before the tRPC mutation call**

Same pattern as Task 3, but using `buildSubmitResponseTypedData` and `hashAnswers`:

```typescript
import { hashAnswers } from "~/lib/eip712/hash";
import { buildSubmitResponseTypedData } from "~/lib/eip712/domain";

// The survey's contentHash must be available client-side (pass as prop or fetch)
const answersHash = hashAnswers(formAnswers);

const typedData = buildSubmitResponseTypedData({
  surveyHash: survey.contentHash as `0x${string}`,
  blindedId: computeBlindedId(walletAddress, survey.contentHash),
  answerCount: formAnswers.length,
  answersHash,
});

const signature = await signTypedData(typedData);
submitMutation.mutate({ ...formData, signature });
```

Note: `survey.contentHash` must be available to the response submission page. If it is not currently returned by the survey query, add it to the tRPC response (it is a public field — no privacy concern).

**Wallet readiness guard (D2):** Disable the Submit button when `wallet?.address` is null. Show a tooltip "Wallet not ready". Import wallet state from Privy.

---

### Task 5: Add `buildPublishSurveyTypedData` and `buildSubmitResponseTypedData` helpers

**Files:**
- Modify: `src/lib/eip712/domain.ts`

- [ ] **Step 1: Add typed data builder functions**

These functions return the full object required by `signTypedData` / `verifyTypedData`:

```typescript
// For survey publishing — signs the compact struct, not the full survey
export function buildPublishSurveyTypedData(message: {
  surveyHash: Hex;
  title: string;
  slug: string;
  questionCount: number;
  creator: `0x${string}`;
}) {
  return {
    domain: getAttestlyDomain(),
    types: {
      PublishSurvey: [
        { name: "surveyHash", type: "bytes32" },
        { name: "title", type: "string" },
        { name: "slug", type: "string" },
        { name: "questionCount", type: "uint8" },
        { name: "creator", type: "address" },
      ],
    },
    primaryType: "PublishSurvey" as const,
    message,
  };
}

// For response submission
export function buildSubmitResponseTypedData(message: {
  surveyHash: Hex;
  blindedId: Hex;
  answerCount: number;
  answersHash: Hex;
}) {
  return {
    domain: getAttestlyDomain(),
    types: {
      SubmitResponse: [
        { name: "surveyHash", type: "bytes32" },
        { name: "blindedId", type: "bytes32" },
        { name: "answerCount", type: "uint8" },
        { name: "answersHash", type: "bytes32" },
      ],
    },
    primaryType: "SubmitResponse" as const,
    message,
  };
}
```

- [ ] **Step 2: Add `buildCloseSurveyTypedData` helper**

```typescript
// For survey closing — signs only the surveyHash
export function buildCloseSurveyTypedData(message: {
  surveyHash: Hex;
}) {
  return {
    domain: getAttestlyDomain(),
    types: {
      CloseSurvey: [
        { name: "surveyHash", type: "bytes32" },
      ],
    },
    primaryType: "CloseSurvey" as const,
    message,
  };
}
```

These must match the `PUBLISH_SURVEY_TYPEHASH`, `SUBMIT_RESPONSE_TYPEHASH`, and `CLOSE_SURVEY_TYPEHASH` structs in Attestly.sol exactly.

**Privy type note (D13):** Privy's `SignTypedDataParams` uses `chainId?: number` and `verifyingContract?: string`, NOT viem's `Hex` types. The typed data builder return types should match Privy's expected input, or the call site must cast. For example, `getAttestlyDomain()` may return `verifyingContract` as `` `0x${string}` `` (viem's `Hex`), but Privy accepts plain `string`. Ensure the types are compatible at the call site — either adjust the builder return type or cast when calling `signTypedData`.

---

### Task 6: Update `survey.close` tRPC procedure and close dialog (D5)

**Files:**
- Modify: `src/server/api/routers/survey.ts`
- Modify: `src/app/.../close-survey-dialog.tsx` (locate via grep)

- [ ] **Step 1: Add `signature` to the `survey.close` input schema**

Find the `survey.close` procedure and extend its Zod input:
```typescript
signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Must be a valid EIP-712 signature"),
```

**Status transition (NI-1):** The procedure should transition the survey status from `PUBLISHED` to `CLOSING` (NOT `CLOSED`). The CLOSE_SURVEY job handler in 2-4b will transition `CLOSING -> CLOSED` on success, soft-delete IN_PROGRESS responses, and enqueue the AI summary generation job. These side effects are moved to the handler to ensure they only happen after on-chain confirmation.

- [ ] **Step 2: Pass `signature` into the CLOSE_SURVEY job payload**

```typescript
await createJob({
  type: "CLOSE_SURVEY",
  surveyId: survey.id,
  payload: {
    surveyId: survey.id,
    signature: input.signature,
  },
});
```

- [ ] **Step 3: Update `close-survey-dialog.tsx` to sign before closing**

Import and use `useSignTypedData` from Privy. Before calling `closeMutation.mutate`, sign the typed data:

```typescript
import { useSignTypedData } from "@privy-io/react-auth";
import { buildCloseSurveyTypedData } from "~/lib/eip712/domain";

// The CloseSurvey typed data signs { surveyHash } only (matching CLOSE_SURVEY_TYPEHASH)
const typedData = buildCloseSurveyTypedData({
  surveyHash: survey.contentHash as `0x${string}`,
});

const signature = await signTypedData(typedData);
closeMutation.mutate({ surveyId: survey.id, signature });
```

**Wallet readiness guard (D2):** Disable the Close button when `wallet?.address` is null. Show a tooltip "Wallet not ready". Import wallet state from Privy.

---

### Task 7: Typecheck and verify

- [ ] **Step 1: Run `pnpm typecheck`** — no TypeScript errors

- [ ] **Step 2: Verify signature format**

The Privy `signTypedData` return value is a `0x`-prefixed 65-byte hex string (`0x` + 130 hex chars). Confirm the regex validation in the tRPC input matches: `/^0x[0-9a-fA-F]{130}$/`.

- [ ] **Step 3: Manual smoke test** (if running locally)

Publish a survey through the UI and confirm:
1. Browser prompts for wallet signature
2. tRPC mutation receives the signature
3. `BackgroundJob` record in DB has `payload.signature` set

---

## Verification Checklist

- [ ] `pnpm typecheck` — no TypeScript errors
- [ ] `survey.publish` tRPC input includes `signature: z.string()` and `surveyHash: z.string()`
- [ ] `response.submit` tRPC input includes `signature: z.string()`
- [ ] `survey.close` tRPC input includes `signature: z.string()`
- [ ] `BackgroundJob.payload` for PUBLISH_SURVEY includes `{ surveyId, signature }`
- [ ] `BackgroundJob.payload` for SUBMIT_RESPONSE includes `{ responseId, signature }`
- [ ] `BackgroundJob.payload` for CLOSE_SURVEY includes `{ surveyId, signature }`
- [ ] `survey.publish` transitions `DRAFT -> PUBLISHING` (not `PUBLISHED`)
- [ ] `response.submit` transitions `IN_PROGRESS -> SUBMITTING` (not `SUBMITTED`)
- [ ] `survey.close` transitions `PUBLISHED -> CLOSING` (not `CLOSED`)
- [ ] Server-side hash validation: `survey.publish` recomputes `surveyHash` and compares to client-provided value
- [ ] Client component signs via Privy before calling `publishMutation.mutate`
- [ ] Client component signs via Privy before calling `submitMutation.mutate`
- [ ] Client component signs via Privy before calling `closeMutation.mutate`
- [ ] Wallet readiness guard: publish, submit, and close buttons disabled when `wallet?.address` is null
- [ ] isSaving guard: publish button disabled while `saveCurrentState` is in-flight
- [ ] `buildPublishSurveyTypedData`, `buildSubmitResponseTypedData`, and `buildCloseSurveyTypedData` exported from `src/lib/eip712/domain.ts`
- [ ] Typed data structs match Attestly.sol TYPEHASH definitions exactly
