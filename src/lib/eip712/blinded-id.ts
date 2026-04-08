import { keccak256, encodePacked, type Hex } from "viem";

/**
 * Compute a blinded respondent ID from a wallet address and survey hash.
 * This allows anonymous survey responses while preventing double-submission.
 */
export function computeBlindedId(
  walletAddress: `0x${string}`,
  surveyHash: `0x${string}`,
): Hex {
  return keccak256(
    encodePacked(["address", "bytes32"], [walletAddress, surveyHash]),
  );
}
