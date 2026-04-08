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
  return process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
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

  if (!process.env.RELAYER_PRIVATE_KEY) {
    throw new Error(
      "RELAYER_PRIVATE_KEY not configured. Cannot submit blockchain transactions.",
    );
  }

  const account = privateKeyToAccount(
    process.env.RELAYER_PRIVATE_KEY as `0x${string}`,
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
  if (!process.env.RELAYER_PRIVATE_KEY) {
    throw new Error("RELAYER_PRIVATE_KEY not configured.");
  }
  const account = privateKeyToAccount(
    process.env.RELAYER_PRIVATE_KEY as `0x${string}`,
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
