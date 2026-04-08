import { describe, it, expect } from "vitest";
import { computeBlindedId } from "../blinded-id";

const wallet1 = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;
const wallet2 = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`;
const survey1 =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`;
const survey2 =
  "0x0000000000000000000000000000000000000000000000000000000000000002" as `0x${string}`;

describe("computeBlindedId", () => {
  it("returns a valid hex string", () => {
    const id = computeBlindedId(wallet1, survey1);
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const id1 = computeBlindedId(wallet1, survey1);
    const id2 = computeBlindedId(wallet1, survey1);
    expect(id1).toBe(id2);
  });

  it("produces different IDs for different wallets", () => {
    const id1 = computeBlindedId(wallet1, survey1);
    const id2 = computeBlindedId(wallet2, survey1);
    expect(id1).not.toBe(id2);
  });

  it("produces different IDs for different surveys", () => {
    const id1 = computeBlindedId(wallet1, survey1);
    const id2 = computeBlindedId(wallet1, survey2);
    expect(id1).not.toBe(id2);
  });
});
