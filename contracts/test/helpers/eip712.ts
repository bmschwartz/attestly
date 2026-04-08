/**
 * EIP-712 signing helpers for Attestly contract tests.
 * Uses viem walletClient.signTypedData for signing.
 */
import { type WalletClient, type Address, keccak256, encodePacked } from "viem";

// EIP-712 domain matches the contract: name="Attestly", version="1"
function getDomain(contractAddress: Address, chainId: number) {
  return {
    name: "Attestly",
    version: "1",
    chainId,
    verifyingContract: contractAddress,
  } as const;
}

/**
 * Sign a PublishSurvey EIP-712 typed data message.
 */
export async function signPublishSurvey(
  signer: WalletClient,
  contractAddress: Address,
  chainId: number,
  params: {
    surveyHash: `0x${string}`;
    title: string;
    slug: string;
    questionCount: number;
    creator: Address;
  },
): Promise<`0x${string}`> {
  const domain = getDomain(contractAddress, chainId);
  const types = {
    PublishSurvey: [
      { name: "surveyHash", type: "bytes32" },
      { name: "title", type: "string" },
      { name: "slug", type: "string" },
      { name: "questionCount", type: "uint8" },
      { name: "creator", type: "address" },
    ],
  } as const;
  const message = {
    surveyHash: params.surveyHash,
    title: params.title,
    slug: params.slug,
    questionCount: params.questionCount,
    creator: params.creator,
  };
  return signer.signTypedData({
    account: signer.account!,
    domain,
    types,
    primaryType: "PublishSurvey",
    message,
  });
}

/**
 * Sign a SubmitResponse EIP-712 typed data message.
 */
export async function signSubmitResponse(
  signer: WalletClient,
  contractAddress: Address,
  chainId: number,
  params: {
    surveyHash: `0x${string}`;
    blindedId: `0x${string}`;
    answerCount: number;
    answersHash: `0x${string}`;
  },
): Promise<`0x${string}`> {
  const domain = getDomain(contractAddress, chainId);
  const types = {
    SubmitResponse: [
      { name: "surveyHash", type: "bytes32" },
      { name: "blindedId", type: "bytes32" },
      { name: "answerCount", type: "uint8" },
      { name: "answersHash", type: "bytes32" },
    ],
  } as const;
  const message = {
    surveyHash: params.surveyHash,
    blindedId: params.blindedId,
    answerCount: params.answerCount,
    answersHash: params.answersHash,
  };
  return signer.signTypedData({
    account: signer.account!,
    domain,
    types,
    primaryType: "SubmitResponse",
    message,
  });
}

/**
 * Sign a CloseSurvey EIP-712 typed data message.
 */
export async function signCloseSurvey(
  signer: WalletClient,
  contractAddress: Address,
  chainId: number,
  params: {
    surveyHash: `0x${string}`;
  },
): Promise<`0x${string}`> {
  const domain = getDomain(contractAddress, chainId);
  const types = {
    CloseSurvey: [{ name: "surveyHash", type: "bytes32" }],
  } as const;
  const message = {
    surveyHash: params.surveyHash,
  };
  return signer.signTypedData({
    account: signer.account!,
    domain,
    types,
    primaryType: "CloseSurvey",
    message,
  });
}

/**
 * Compute blinded ID: keccak256(abi.encodePacked(signerAddress, surveyHash))
 */
export function computeBlindedId(
  signerAddress: Address,
  surveyHash: `0x${string}`,
): `0x${string}` {
  return keccak256(
    encodePacked(["address", "bytes32"], [signerAddress, surveyHash]),
  );
}
