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

1. **Server side** — Modify `survey.publish` and `response.submit` tRPC procedures to:
   - Accept a `signature` field in the input
   - Store the signature in the `BackgroundJob.payload` (alongside `surveyId`/`responseId`)
   - Validate the signature server-side before enqueuing (optional but recommended)

2. **Client side** — Modify the publish survey and submit response call sites to:
   - Compute the EIP-712 hash using the `hashSurvey`/`hashAnswers` functions
   - Sign the hash using Privy's `signTypedData` (or `useSignTypedData` hook)
   - Pass the resulting signature to the tRPC mutation

---

## File Structure

- Modify: `src/server/api/routers/survey.ts` — add `signature` field to `publish` input
- Modify: `src/server/api/routers/response.ts` — add `signature` field to `submit` input
- Modify: client component that calls `survey.publish` — add EIP-712 signing step before mutation
- Modify: client component that calls `response.submit` — add EIP-712 signing step before mutation
- Modify: `src/env.js` — ensure `NEXT_PUBLIC_ATTESTLY_CONTRACT_ADDRESS` and `NEXT_PUBLIC_CHAIN_ID` are present (added in 2-4a)

---

### Task 1: Update `survey.publish` tRPC procedure

**Files:**
- Modify: `src/server/api/routers/survey.ts`

- [ ] **Step 1: Add `signature` to the `publish` input schema**

Find the `survey.publish` procedure and extend its Zod input to include:
```typescript
signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Must be a valid EIP-712 signature"),
```

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

- [ ] **Step 3: (Optional) Validate signature server-side before enqueuing**

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
    domain: getEip712Domain(),
    types: {
      PublishSurvey: [
        { name: "surveyHash", type: "bytes32" },
        { name: "title", type: "string" },
        { name: "slug", type: "string" },
        { name: "questionCount", type: "uint256" },
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
    domain: getEip712Domain(),
    types: {
      SubmitResponse: [
        { name: "surveyHash", type: "bytes32" },
        { name: "blindedId", type: "bytes32" },
        { name: "answerCount", type: "uint256" },
        { name: "answersHash", type: "bytes32" },
      ],
    },
    primaryType: "SubmitResponse" as const,
    message,
  };
}
```

These must match the `PUBLISH_SURVEY_TYPEHASH` and `SUBMIT_RESPONSE_TYPEHASH` structs in Attestly.sol exactly.

---

### Task 6: Typecheck and verify

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
- [ ] `survey.publish` tRPC input includes `signature: z.string()`
- [ ] `response.submit` tRPC input includes `signature: z.string()`
- [ ] `BackgroundJob.payload` for PUBLISH_SURVEY includes `{ surveyId, signature }`
- [ ] `BackgroundJob.payload` for SUBMIT_RESPONSE includes `{ responseId, signature }`
- [ ] Client component signs via Privy before calling `publishMutation.mutate`
- [ ] Client component signs via Privy before calling `submitMutation.mutate`
- [ ] `buildPublishSurveyTypedData` and `buildSubmitResponseTypedData` exported from `src/lib/eip712/domain.ts`
- [ ] Typed data structs match Attestly.sol TYPEHASH definitions exactly
