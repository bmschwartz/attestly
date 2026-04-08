# Sub-Plan 2-4a: Blockchain Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the blockchain infrastructure: Base L2 provider, relayer with gas ceiling and revert handling, typed contract client, and environment variables.

**Architecture:** The blockchain module at `src/server/blockchain/` provides: (1) a Base L2 provider (public client for reads, wallet client for writes), (2) a relayer that submits transactions using the relayer wallet with gas ceiling (10x) and permanent failure on contract reverts, and (3) a typed contract client wrapping the Attestly smart contract.

**Wallet separation:** Admin wallet (`ADMIN_PRIVATE_KEY`) owns the UUPS proxy (cold storage in prod). Relayer wallet (`RELAYER_PRIVATE_KEY`) submits runtime transactions (hot wallet, AWS KMS in prod). Distinct keys.

**Tech Stack:** viem, Prisma 7

**Spec reference:** `docs/superpowers/specs/2026-04-05-blockchain-verification-design.md`

**Depends on:** Sub-Plan 2-1b (contract ABI from compilation)

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

**Important:** `RELAYER_PRIVATE_KEY` is the hot wallet key used for submitting transactions at runtime. This is NOT the admin/deploy key (`ADMIN_PRIVATE_KEY` in hardhat.config.ts). The admin key owns the UUPS proxy and is cold storage in production. The relayer key is a separate funded wallet. In production, the relayer uses AWS KMS instead of a raw private key env var.

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
- `privateKeyToAccount` from `viem/accounts` derives the account from the `RELAYER_PRIVATE_KEY`. This is the hot wallet used for submitting transactions at runtime, NOT the admin key that owns the UUPS proxy.
- `resetClients` exported for test isolation.
- The relayer private key is stored as a hex string in the env var for dev. In production, this would be replaced with AWS KMS signing (future enhancement).

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
- The contract address is read from `ATTESTLY_CONTRACT_ADDRESS` env var. This is the UUPS proxy address, which is stable after first deploy (proxy address doesn't change on upgrade). Validated at runtime, not import time.
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
1. **Gas ceiling** -- pre-estimates gas and rejects transactions above 10x expected cost (marks job PENDING for retry later)
2. **Transaction submission with confirmation** -- submits a tx and waits for on-chain confirmation
3. **Error classification** -- distinguishes between permanent failures (contract reverts) and transient failures (network/nonce errors)

**Error handling strategy:**
- **Contract reverts** (e.g., `SurveyAlreadyExists`, `DuplicateResponse`, `SignerMismatch`): These are deterministic -- retrying would waste gas and produce the same revert. The job is marked **FAILED** permanently.
- **Network/nonce errors** (e.g., RPC timeout, nonce too low, insufficient funds): These are transient. The job stays **PENDING** for retry with exponential backoff.
- **Gas ceiling exceeded**: The estimated gas is above 10x the expected cost for this operation. The job stays **PENDING** for retry later (gas prices may drop).

```typescript
import { type Hex, type TransactionReceipt, BaseError, ContractFunctionRevertedError } from "viem";
import { getPublicClient } from "./provider";

// Expected gas costs per operation (in gas units).
// Used to compute the gas ceiling (10x multiplier).
const EXPECTED_GAS: Record<string, bigint> = {
  publishSurvey: 150_000n,
  submitResponse: 120_000n,
  closeSurvey: 80_000n,
};

const GAS_CEILING_MULTIPLIER = 10n;

/**
 * Custom error class for permanent failures (contract reverts).
 * The job handler should catch this and mark the job as permanently FAILED.
 */
export class PermanentTransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentTransactionError";
  }
}

/**
 * Custom error class for gas ceiling violations.
 * The job handler should catch this and leave the job as PENDING for retry.
 */
export class GasCeilingExceededError extends Error {
  constructor(
    public estimated: bigint,
    public ceiling: bigint,
    message: string,
  ) {
    super(message);
    this.name = "GasCeilingExceededError";
  }
}

/**
 * Check if the estimated gas is within the gas ceiling for the given operation.
 * Rejects transactions above 10x expected gas cost.
 *
 * @param operationName - The contract function name (e.g., "publishSurvey")
 * @param estimatedGas - The estimated gas from the RPC
 * @throws GasCeilingExceededError if the estimate exceeds the ceiling
 */
export function checkGasCeiling(operationName: string, estimatedGas: bigint): void {
  const expected = EXPECTED_GAS[operationName];
  if (!expected) return; // Unknown operation, skip ceiling check

  const ceiling = expected * GAS_CEILING_MULTIPLIER;
  if (estimatedGas > ceiling) {
    throw new GasCeilingExceededError(
      estimatedGas,
      ceiling,
      `[Relayer] Gas ceiling exceeded for ${operationName}: estimated ${estimatedGas}, ceiling ${ceiling} (${GAS_CEILING_MULTIPLIER}x of ${expected})`,
    );
  }
}

/**
 * Determine if a viem error is a contract revert (permanent failure).
 * Contract reverts are deterministic -- retrying wastes gas.
 */
export function isContractRevert(error: unknown): boolean {
  if (error instanceof BaseError) {
    return error.walk((e) => e instanceof ContractFunctionRevertedError) !== null;
  }
  return false;
}

/**
 * Wait for a transaction to be confirmed on-chain.
 *
 * @param txHash - The transaction hash to wait for
 * @param confirmations - Number of confirmations to wait for (default: 1)
 * @returns The transaction receipt
 * @throws PermanentTransactionError if the transaction reverts on-chain
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
    throw new PermanentTransactionError(
      `Transaction ${txHash} reverted on-chain. Block: ${receipt.blockNumber}. This is a permanent failure -- retrying would waste gas.`,
    );
  }

  return receipt;
}

/**
 * Submit a contract write call and wait for confirmation.
 * This is the main entry point for relayer operations.
 *
 * Error handling:
 * - Contract reverts -> throws PermanentTransactionError (job should be marked FAILED)
 * - Gas ceiling exceeded -> throws GasCeilingExceededError (job should stay PENDING)
 * - Network/nonce errors -> throws regular Error (job should stay PENDING for retry)
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
    // Check if the submission itself was a contract revert (e.g., from estimateGas)
    if (isContractRevert(error)) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new PermanentTransactionError(
        `[Relayer] Contract revert during submission of ${description}: ${msg}`,
      );
    }
    // Gas ceiling errors pass through as-is
    if (error instanceof GasCeilingExceededError) {
      throw error;
    }
    // All other errors are transient (network, nonce, etc.)
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
- **Gas ceiling:** Rejects transactions with estimated gas above 10x expected cost. The job stays PENDING for retry later (gas prices may drop). Expected gas constants are per-operation.
- **Permanent failure on contract revert:** Contract reverts (e.g., `SurveyAlreadyExists`, `DuplicateResponse`) are deterministic -- retrying wastes gas. These throw `PermanentTransactionError`, and the job handler marks the job as permanently FAILED.
- **Transient retry on network errors:** Network/nonce errors (RPC timeout, nonce too low, insufficient funds) keep the job PENDING for retry with exponential backoff.
- The relayer uses `RELAYER_PRIVATE_KEY` (hot wallet), NOT the admin key. The admin key is only for proxy ownership/upgrades.
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
