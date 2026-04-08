import type { TypedDataDomain } from "viem";

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
