import type { Hex, TypedDataDomain } from "viem";

export function getAttestlyDomain(): TypedDataDomain {
  const contractAddress =
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_ATTESTLY_CONTRACT_ADDRESS
      : undefined) ?? "0x0000000000000000000000000000000000000000";

  const chainId = Number(
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_CHAIN_ID
      : undefined) ?? "8453",
  );

  return {
    name: "Attestly",
    version: "1",
    chainId,
    verifyingContract: contractAddress as `0x${string}`,
  };
}

// ---------------------------------------------------------------------------
// Typed data builder functions (for signTypedData / verifyTypedData)
// ---------------------------------------------------------------------------

/**
 * Build the full EIP-712 typed data object for publishing a survey.
 * Matches PUBLISH_SURVEY_TYPEHASH in Attestly.sol:
 *   PublishSurvey(bytes32 surveyHash,string title,string slug,uint8 questionCount,address creator)
 */
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

/**
 * Build the full EIP-712 typed data object for submitting a response.
 * Matches SUBMIT_RESPONSE_TYPEHASH in Attestly.sol:
 *   SubmitResponse(bytes32 surveyHash,bytes32 blindedId,uint8 answerCount,bytes32 answersHash)
 */
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

/**
 * Build the full EIP-712 typed data object for closing a survey.
 * Matches CLOSE_SURVEY_TYPEHASH in Attestly.sol:
 *   CloseSurvey(bytes32 surveyHash)
 */
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
