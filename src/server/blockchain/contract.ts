import { type Chain, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";
import { env } from "~/env";
import { getPublicClient, getWalletClient } from "./provider";
import { attestlyAbi } from "./abi";

// Re-derive chain for writeContract calls (viem requires it when WalletClient type is generic)
function getChain(): Chain {
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "8453");
  return chainId === 84532 ? baseSepolia : base;
}

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
  return {
    address: getContractAddress(),
    abi: attestlyAbi,
    client: getPublicClient(),
  };
}

/**
 * Get a write-enabled contract instance (uses wallet client).
 */
export function getWriteContract() {
  return {
    address: getContractAddress(),
    abi: attestlyAbi,
    client: getWalletClient(),
  };
}

// --- Typed wrapper functions ---

/**
 * Submit a publishSurvey transaction via the relayer.
 *
 * @param surveyHash - Chain-independent content hash of the survey (bytes32)
 * @param ipfsCid - IPFS CID of the pinned survey JSON
 * @param creator - Creator's wallet address
 * @param title - Survey title (compact signing payload)
 * @param slug - Survey slug (compact signing payload)
 * @param questionCount - Number of questions (compact signing payload)
 * @param signature - Creator's EIP-712 signature over the compact PublishSurvey struct
 * @returns Transaction hash
 */
export async function publishSurveyOnChain(
  surveyHash: Hex,
  ipfsCid: string,
  creator: `0x${string}`,
  title: string,
  slug: string,
  questionCount: number,
  signature: Hex,
): Promise<Hex> {
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    chain: getChain(),
    account: walletClient.account!,
    address: getContractAddress(),
    abi: attestlyAbi,
    functionName: "publishSurvey",
    args: [surveyHash, ipfsCid, creator, title, slug, questionCount, signature],
  });
  return hash;
}

/**
 * Submit a submitResponse transaction via the relayer.
 *
 * @param surveyHash - Chain-independent content hash of the survey (bytes32)
 * @param blindedId - Blinded respondent identifier (bytes32)
 * @param ipfsCid - IPFS CID of the pinned response JSON
 * @param answerCount - Number of answers (compact signing payload)
 * @param answersHash - Chain-independent content hash of answers (compact signing payload)
 * @param signature - Respondent's EIP-712 signature over the compact SubmitResponse struct
 * @returns Transaction hash
 */
export async function submitResponseOnChain(
  surveyHash: Hex,
  blindedId: Hex,
  ipfsCid: string,
  answerCount: number,
  answersHash: Hex,
  signature: Hex,
): Promise<Hex> {
  const walletClient = getWalletClient();
  const hash = await walletClient.writeContract({
    chain: getChain(),
    account: walletClient.account!,
    address: getContractAddress(),
    abi: attestlyAbi,
    functionName: "submitResponse",
    args: [surveyHash, blindedId, ipfsCid, answerCount, answersHash, signature],
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
    chain: getChain(),
    account: walletClient.account!,
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
