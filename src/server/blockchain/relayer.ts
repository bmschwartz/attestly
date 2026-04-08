import {
  type Hex,
  type TransactionReceipt,
  BaseError,
  ContractFunctionRevertedError,
} from "viem";
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
  estimated: bigint;
  ceiling: bigint;

  constructor(estimated: bigint, ceiling: bigint, message: string) {
    super(message);
    this.name = "GasCeilingExceededError";
    this.estimated = estimated;
    this.ceiling = ceiling;
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
export function checkGasCeiling(
  operationName: string,
  estimatedGas: bigint,
): void {
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
    return (
      error.walk((e) => e instanceof ContractFunctionRevertedError) !== null
    );
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
 * Gas ceiling enforcement:
 * - Before submitting, estimate gas and check against the ceiling (10x expected).
 * - If ceiling exceeded, throws GasCeilingExceededError (job stays PENDING for retry).
 *
 * Error handling:
 * - Contract reverts -> throws PermanentTransactionError (job should be marked FAILED)
 * - Gas ceiling exceeded -> throws GasCeilingExceededError (job should stay PENDING)
 * - Network/nonce errors -> throws regular Error (job should stay PENDING for retry)
 *
 * @param estimateFn - An async function that estimates gas for the operation
 * @param submitFn - An async function that submits the transaction and returns the tx hash
 * @param operationName - The contract function name (e.g., "publishSurvey") for ceiling lookup
 * @param description - Human-readable description for logging
 * @returns Object containing the tx hash and receipt
 */
export async function relayAndConfirm(
  estimateFn: () => Promise<bigint>,
  submitFn: () => Promise<Hex>,
  operationName: string,
  description: string,
): Promise<{ txHash: Hex; receipt: TransactionReceipt }> {
  console.log(`[Relayer] Estimating gas for: ${description}`);

  // Check gas ceiling before submitting
  try {
    const estimatedGas = await estimateFn();
    checkGasCeiling(operationName, estimatedGas);
    console.log(`[Relayer] Gas estimate: ${estimatedGas} (within ceiling)`);
  } catch (error) {
    if (error instanceof GasCeilingExceededError) throw error;
    if (isContractRevert(error)) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new PermanentTransactionError(
        `[Relayer] Contract revert during gas estimation for ${description}: ${msg}`,
      );
    }
    // Gas estimation network failure — treat as transient
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[Relayer] Gas estimation failed for ${description}: ${msg}`,
    );
  }

  console.log(`[Relayer] Submitting: ${description}`);

  let txHash: Hex;
  try {
    txHash = await submitFn();
  } catch (error) {
    // Check if the submission itself was a contract revert
    if (isContractRevert(error)) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new PermanentTransactionError(
        `[Relayer] Contract revert during submission of ${description}: ${msg}`,
      );
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
