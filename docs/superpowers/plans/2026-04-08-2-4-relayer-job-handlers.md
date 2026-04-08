# Sub-Plan 2-4: Relayer + Job Handlers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the blockchain relayer and wire the four blockchain job handlers: PUBLISH_SURVEY, SUBMIT_RESPONSE, CLOSE_SURVEY, and VERIFY_RESPONSES. These replace the placeholder handlers registered in sub-plan 4a with real implementations that pin data to IPFS, compute EIP-712 hashes, and submit transactions to the Attestly smart contract on Base L2.

**Architecture:** The blockchain module lives at `src/server/blockchain/` and provides: (1) a Base L2 provider (public client for reads, wallet client for writes), (2) a relayer that submits transactions using a funded hot wallet, and (3) a typed contract client wrapping the Attestly smart contract. The job handlers in `src/server/jobs/handlers/` orchestrate the full flow: IPFS pinning -> EIP-712 hashing -> contract call -> database update. Job ordering ensures SUBMIT_RESPONSE waits for PUBLISH_SURVEY to complete for the same survey.

**Tech Stack:** viem (provider, wallet client, contract interaction), Prisma 7, existing job queue (sub-plan 4a)

**Spec reference:** `docs/superpowers/specs/2026-04-05-blockchain-verification-design.md` (relayer architecture, job types, retry policy, job ordering)

**Depends on:**
- Sub-Plan 2-2 (EIP-712 library -- hash computation, blinded ID, signature verification)
- Sub-Plan 2-3 (IPFS/Pinata -- survey/response pinning)
- Sub-Plan 2-1b (contract deployment -- contract address and ABI; can use placeholder ABI for development)
- Sub-Plan 4a (background job queue -- queue service, handler registry, worker)

---

## File Structure

- Modify: `src/env.js` -- add BASE_RPC_URL, RELAYER_PRIVATE_KEY, ATTESTLY_CONTRACT_ADDRESS
- Create: `src/server/blockchain/provider.ts` -- Base L2 JSON-RPC provider setup
- Create: `src/server/blockchain/relayer.ts` -- transaction submission with nonce management
- Create: `src/server/blockchain/contract.ts` -- Attestly contract client (typed wrapper)
- Create: `src/server/blockchain/abi.ts` -- Attestly contract ABI (from Hardhat compilation)
- Create: `src/server/blockchain/index.ts` -- barrel export
- Create: `src/server/jobs/handlers/publish-survey.ts` -- PUBLISH_SURVEY handler
- Create: `src/server/jobs/handlers/submit-response.ts` -- SUBMIT_RESPONSE handler
- Create: `src/server/jobs/handlers/close-survey.ts` -- CLOSE_SURVEY handler
- Create: `src/server/jobs/handlers/verify-responses.ts` -- VERIFY_RESPONSES handler
- Modify: `src/server/jobs/handlers.ts` -- replace placeholder handlers with real implementations

---

### Task 1: Add blockchain environment variables

**Files:**
- Modify: `src/env.js`

- [ ] **Step 1: Add blockchain env vars to src/env.js**

Add three new server-side environment variables to the `server` section of `src/env.js`:

```typescript
BASE_RPC_URL: z.string().url().optional(),
RELAYER_PRIVATE_KEY: z.string().min(1).optional(),
ATTESTLY_CONTRACT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
```

And add corresponding entries to the `runtimeEnv` section:

```typescript
BASE_RPC_URL: process.env.BASE_RPC_URL,
RELAYER_PRIVATE_KEY: process.env.RELAYER_PRIVATE_KEY,
ATTESTLY_CONTRACT_ADDRESS: process.env.ATTESTLY_CONTRACT_ADDRESS,
```

All three are optional so the app can still boot without blockchain configuration (Phase 1 features don't need blockchain). The blockchain modules will check for these at runtime and throw descriptive errors if blockchain operations are attempted without configuration.

**Default RPC URL:** If BASE_RPC_URL is not set, the provider module should fall back to Base mainnet's public RPC (`https://mainnet.base.org`). This is sufficient for reads but rate-limited. Production should use an Alchemy or Infura endpoint.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/env.js
git commit -m "chore: add blockchain env vars (BASE_RPC_URL, RELAYER_PRIVATE_KEY, contract address)"
```

---

### Task 2: Create Base L2 provider

**Files:**
- Create: `src/server/blockchain/provider.ts`

- [ ] **Step 1: Create the provider module**

Create `src/server/blockchain/provider.ts`:

This module provides two viem clients:
1. **Public client** -- for read-only contract calls and event queries. Uses the configured RPC URL.
2. **Wallet client** -- for submitting transactions. Uses the relayer private key.

```typescript
import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { env } from "~/env";

/**
 * Get the configured chain based on NEXT_PUBLIC_CHAIN_ID.
 * Defaults to Base mainnet (8453).
 */
function getChain(): Chain {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "8453");
  return chainId === 84532 ? baseSepolia : base;
}

/**
 * Get the RPC URL. Falls back to Base mainnet public RPC if not configured.
 */
function getRpcUrl(): string {
  return env.BASE_RPC_URL ?? "https://mainnet.base.org";
}

let _publicClient: PublicClient | null = null;
let _walletClient: WalletClient | null = null;

/**
 * Get a public client for read-only contract calls.
 * Lazily initialized, cached for the process lifetime.
 */
export function getPublicClient(): PublicClient {
  if (_publicClient) return _publicClient;

  _publicClient = createPublicClient({
    chain: getChain(),
    transport: http(getRpcUrl()),
  });

  return _publicClient;
}

/**
 * Get a wallet client for submitting transactions via the relayer wallet.
 * Lazily initialized, cached for the process lifetime.
 *
 * Throws if RELAYER_PRIVATE_KEY is not configured.
 */
export function getWalletClient(): WalletClient {
  if (_walletClient) return _walletClient;

  if (!env.RELAYER_PRIVATE_KEY) {
    throw new Error(
      "RELAYER_PRIVATE_KEY not configured. Cannot submit blockchain transactions.",
    );
  }

  const account = privateKeyToAccount(
    env.RELAYER_PRIVATE_KEY as `0x${string}`,
  );

  _walletClient = createWalletClient({
    account,
    chain: getChain(),
    transport: http(getRpcUrl()),
  });

  return _walletClient;
}

/**
 * Get the relayer wallet address.
 * Throws if RELAYER_PRIVATE_KEY is not configured.
 */
export function getRelayerAddress(): `0x${string}` {
  if (!env.RELAYER_PRIVATE_KEY) {
    throw new Error("RELAYER_PRIVATE_KEY not configured.");
  }
  const account = privateKeyToAccount(
    env.RELAYER_PRIVATE_KEY as `0x${string}`,
  );
  return account.address;
}

/**
 * Reset cached clients (for testing).
 */
export function resetClients(): void {
  _publicClient = null;
  _walletClient = null;
}
```

Key decisions:
- Lazy initialization so the module can be imported without env vars.
- Clients are cached for the process lifetime (the worker is a long-running process).
- `privateKeyToAccount` from `viem/accounts` derives the account from the private key.
- `resetClients` exported for test isolation.
- The relayer private key is stored as a hex string in the env var. In production, this would be replaced with AWS KMS signing (future enhancement).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/blockchain/provider.ts
git commit -m "feat: add Base L2 provider with public and wallet clients"
```

---

### Task 3: Create contract ABI and typed client

**Files:**
- Create: `src/server/blockchain/abi.ts`
- Create: `src/server/blockchain/contract.ts`

- [ ] **Step 1: Create the contract ABI**

Create `src/server/blockchain/abi.ts`:

This contains the Attestly contract ABI in the viem-compatible format. The ABI is derived from the IAttestly interface in the blockchain verification design spec. Once the contract is compiled with Hardhat (sub-plan 2-1b), this should be replaced with the auto-generated ABI.

```typescript
/**
 * Attestly smart contract ABI.
 *
 * Derived from IAttestly interface in the blockchain verification design spec.
 * Replace with auto-generated ABI from Hardhat compilation once available.
 */
export const attestlyAbi = [
  // Events
  {
    type: "event",
    name: "SurveyPublished",
    inputs: [
      { name: "surveyHash", type: "bytes32", indexed: true },
      { name: "ipfsCid", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ResponseSubmitted",
    inputs: [
      { name: "surveyHash", type: "bytes32", indexed: true },
      { name: "blindedId", type: "bytes32", indexed: true },
      { name: "ipfsCid", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SurveyClosed",
    inputs: [
      { name: "surveyHash", type: "bytes32", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },

  // State-changing functions
  {
    type: "function",
    name: "publishSurvey",
    inputs: [
      { name: "surveyHash", type: "bytes32" },
      { name: "ipfsCid", type: "string" },
      { name: "creator", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitResponse",
    inputs: [
      { name: "surveyHash", type: "bytes32" },
      { name: "blindedId", type: "bytes32" },
      { name: "ipfsCid", type: "string" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "closeSurvey",
    inputs: [
      { name: "surveyHash", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // View functions
  {
    type: "function",
    name: "getSurvey",
    inputs: [{ name: "surveyHash", type: "bytes32" }],
    outputs: [
      { name: "creator", type: "address" },
      { name: "publishedAt", type: "uint256" },
      { name: "closed", type: "bool" },
      { name: "closedAt", type: "uint256" },
      { name: "responseCount", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isResponseSubmitted",
    inputs: [
      { name: "surveyHash", type: "bytes32" },
      { name: "blindedId", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getResponseCount",
    inputs: [{ name: "surveyHash", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
```

- [ ] **Step 2: Create the typed contract client**

Create `src/server/blockchain/contract.ts`:

This module provides typed wrappers around the Attestly contract functions. It uses viem's `getContract` for type-safe interaction.

```typescript
import { getContract, type GetContractReturnType, type Hex } from "viem";
import { env } from "~/env";
import { getPublicClient, getWalletClient } from "./provider";
import { attestlyAbi } from "./abi";

/**
 * Get the configured Attestly contract address.
 * Throws if ATTESTLY_CONTRACT_ADDRESS is not set.
 */
function getContractAddress(): `0x${string}` {
  const address = env.ATTESTLY_CONTRACT_ADDRESS;
  if (!address) {
    throw new Error(
      "ATTESTLY_CONTRACT_ADDRESS not configured. Deploy the contract and set the env var.",
    );
  }
  return address as `0x${string}`;
}

/**
 * Get a read-only contract instance (uses public client).
 */
export function getReadContract() {
  return getContract({
    address: getContractAddress(),
    abi: attestlyAbi,
    client: getPublicClient(),
  });
}

/**
 * Get a write-enabled contract instance (uses wallet client).
 */
export function getWriteContract() {
  return getContract({
    address: getContractAddress(),
    abi: attestlyAbi,
    client: getWalletClient(),
  });
}

// --- Typed wrapper functions ---

/**
 * Submit a publishSurvey transaction via the relayer.
 *
 * @param surveyHash - EIP-712 hash of the survey (bytes32)
 * @param ipfsCid - IPFS CID of the pinned survey JSON
 * @param creator - Creator's wallet address
 * @param signature - Creator's EIP-712 signature
 * @returns Transaction hash
 */
export async function publishSurveyOnChain(
  surveyHash: Hex,
  ipfsCid: string,
  creator: `0x${string}`,
  signature: Hex,
): Promise<Hex> {
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    address: getContractAddress(),
    abi: attestlyAbi,
    functionName: "publishSurvey",
    args: [surveyHash, ipfsCid, creator, signature],
  });
  return hash;
}

/**
 * Submit a submitResponse transaction via the relayer.
 *
 * @param surveyHash - EIP-712 hash of the survey (bytes32)
 * @param blindedId - Blinded respondent identifier (bytes32)
 * @param ipfsCid - IPFS CID of the pinned response JSON
 * @param signature - Respondent's EIP-712 signature
 * @returns Transaction hash
 */
export async function submitResponseOnChain(
  surveyHash: Hex,
  blindedId: Hex,
  ipfsCid: string,
  signature: Hex,
): Promise<Hex> {
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    address: getContractAddress(),
    abi: attestlyAbi,
    functionName: "submitResponse",
    args: [surveyHash, blindedId, ipfsCid, signature],
  });
  return hash;
}

/**
 * Submit a closeSurvey transaction via the relayer.
 *
 * @param surveyHash - EIP-712 hash of the survey (bytes32)
 * @param signature - Creator's EIP-712 close signature
 * @returns Transaction hash
 */
export async function closeSurveyOnChain(
  surveyHash: Hex,
  signature: Hex,
): Promise<Hex> {
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    address: getContractAddress(),
    abi: attestlyAbi,
    functionName: "closeSurvey",
    args: [surveyHash, signature],
  });
  return hash;
}

/**
 * Read survey data from the contract.
 */
export async function getSurveyOnChain(surveyHash: Hex) {
  const publicClient = getPublicClient();
  const result = await publicClient.readContract({
    address: getContractAddress(),
    abi: attestlyAbi,
    functionName: "getSurvey",
    args: [surveyHash],
  });
  return result;
}

/**
 * Check if a response has been submitted on-chain.
 */
export async function isResponseSubmittedOnChain(
  surveyHash: Hex,
  blindedId: Hex,
): Promise<boolean> {
  const publicClient = getPublicClient();
  const result = await publicClient.readContract({
    address: getContractAddress(),
    abi: attestlyAbi,
    functionName: "isResponseSubmitted",
    args: [surveyHash, blindedId],
  });
  return result as boolean;
}

/**
 * Get the on-chain response count for a survey.
 */
export async function getResponseCountOnChain(
  surveyHash: Hex,
): Promise<bigint> {
  const publicClient = getPublicClient();
  const result = await publicClient.readContract({
    address: getContractAddress(),
    abi: attestlyAbi,
    functionName: "getResponseCount",
    args: [surveyHash],
  });
  return result as bigint;
}
```

Key decisions:
- All write functions return the transaction hash. The caller (job handler) waits for confirmation separately.
- Read functions use the public client (no gas costs).
- The contract address is validated at runtime, not import time.
- viem's `writeContract` handles gas estimation and nonce management automatically. For production, explicit nonce management may be needed to handle concurrent transactions from the same relayer wallet (see Task 4 relayer module).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/blockchain/abi.ts src/server/blockchain/contract.ts
git commit -m "feat: add Attestly contract ABI and typed contract client"
```

---

### Task 4: Create relayer module

**Files:**
- Create: `src/server/blockchain/relayer.ts`

- [ ] **Step 1: Create the relayer module**

Create `src/server/blockchain/relayer.ts`:

The relayer module provides higher-level transaction management on top of the contract client:
1. **Transaction submission with confirmation** -- submits a tx and waits for on-chain confirmation
2. **Gas estimation** -- pre-estimates gas to avoid surprises
3. **Error handling** -- wraps viem errors with descriptive messages

```typescript
import { type Hex, type TransactionReceipt } from "viem";
import { getPublicClient } from "./provider";

/**
 * Wait for a transaction to be confirmed on-chain.
 *
 * @param txHash - The transaction hash to wait for
 * @param confirmations - Number of confirmations to wait for (default: 1)
 * @returns The transaction receipt
 * @throws If the transaction reverts or times out
 */
export async function waitForTransaction(
  txHash: Hex,
  confirmations = 1,
): Promise<TransactionReceipt> {
  const publicClient = getPublicClient();

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations,
    timeout: 60_000, // 60 seconds timeout
  });

  if (receipt.status === "reverted") {
    throw new Error(
      `Transaction ${txHash} reverted. Block: ${receipt.blockNumber}`,
    );
  }

  return receipt;
}

/**
 * Submit a contract write call and wait for confirmation.
 * This is the main entry point for relayer operations.
 *
 * @param submitFn - An async function that submits the transaction and returns the tx hash
 * @param description - Human-readable description for logging (e.g., "publishSurvey for 0x4d2e...")
 * @returns Object containing the tx hash and receipt
 */
export async function relayAndConfirm(
  submitFn: () => Promise<Hex>,
  description: string,
): Promise<{ txHash: Hex; receipt: TransactionReceipt }> {
  console.log(`[Relayer] Submitting: ${description}`);

  let txHash: Hex;
  try {
    txHash = await submitFn();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`[Relayer] Failed to submit ${description}: ${msg}`);
  }

  console.log(`[Relayer] Submitted tx: ${txHash}`);

  const receipt = await waitForTransaction(txHash);

  console.log(
    `[Relayer] Confirmed: ${description} | tx: ${txHash} | block: ${receipt.blockNumber} | gas: ${receipt.gasUsed}`,
  );

  return { txHash, receipt };
}
```

Key decisions:
- `relayAndConfirm` is the primary abstraction: submit + wait in one call. Job handlers use this pattern.
- 60-second timeout for transaction confirmation. Base L2 blocks are fast (~2 seconds), so this is generous.
- Reverted transactions throw an error (caught by the job handler, which marks the job as failed for retry).
- Gas estimation is handled by viem internally (via `writeContract`). Explicit estimation could be added later for gas price monitoring/alerting.
- Nonce management is handled by viem's built-in nonce manager. For high-throughput production use, a manual nonce queue would be needed to prevent nonce gaps with concurrent transactions. This is a future enhancement.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/blockchain/relayer.ts
git commit -m "feat: add relayer module with tx submission and confirmation"
```

---

### Task 5: Create blockchain barrel export

**Files:**
- Create: `src/server/blockchain/index.ts`

- [ ] **Step 1: Create the barrel export**

Create `src/server/blockchain/index.ts`:

```typescript
// Provider
export {
  getPublicClient,
  getWalletClient,
  getRelayerAddress,
  resetClients,
} from "./provider";

// Contract
export {
  publishSurveyOnChain,
  submitResponseOnChain,
  closeSurveyOnChain,
  getSurveyOnChain,
  isResponseSubmittedOnChain,
  getResponseCountOnChain,
  getReadContract,
  getWriteContract,
} from "./contract";

// ABI
export { attestlyAbi } from "./abi";

// Relayer
export { waitForTransaction, relayAndConfirm } from "./relayer";
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/blockchain/index.ts
git commit -m "feat: add blockchain module barrel export"
```

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
- [ ] `src/server/blockchain/relayer.ts` -- exports `waitForTransaction` and `relayAndConfirm`
- [ ] `src/server/jobs/handlers/publish-survey.ts` -- full flow: load survey -> hash -> pin IPFS -> submit tx -> update DB
- [ ] `src/server/jobs/handlers/submit-response.ts` -- full flow: load response -> compute blinded ID -> pin IPFS -> submit tx -> update DB
- [ ] `src/server/jobs/handlers/close-survey.ts` -- submit closeSurvey tx -> update DB -> queue VERIFY_RESPONSES
- [ ] `src/server/jobs/handlers/verify-responses.ts` -- check IPFS CIDs, blinded ID uniqueness, count match
- [ ] `src/server/jobs/handlers.ts` -- real handlers registered (no more placeholders for blockchain job types)
- [ ] `src/server/jobs/queue.ts` -- has `areDependenciesMet` function for job ordering
- [ ] `src/server/jobs/worker.ts` -- checks dependencies before processing jobs
- [ ] SUBMIT_RESPONSE jobs wait for PUBLISH_SURVEY to complete for the same survey
- [ ] CLOSE_SURVEY jobs wait for all SUBMIT_RESPONSE jobs to complete for the same survey
