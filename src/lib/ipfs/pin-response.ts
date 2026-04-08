import type { IpfsResponseJSON } from "./schemas";
import { ipfsResponseSchema } from "./schemas";
import { canonicalize } from "./deterministic-json";
import { pinBlob } from "./pinata";

export type PinResponseInput = Omit<IpfsResponseJSON, "version">;

/**
 * Build the canonical IPFS JSON payload for a survey response (without pinning).
 */
export function buildResponseJSON(input: PinResponseInput): IpfsResponseJSON {
  const json: IpfsResponseJSON = {
    version: "1",
    ...input,
  };
  // Validate against the schema
  ipfsResponseSchema.parse(json);
  return json;
}

/**
 * Pin a survey response to IPFS. Returns the CID string.
 *
 * Steps: build JSON -> validate with Zod -> canonicalize -> encode to bytes -> pin via pinBlob.
 */
export async function pinResponse(input: PinResponseInput): Promise<string> {
  const json = buildResponseJSON(input);
  const canonical = canonicalize(json);
  if (canonical === undefined) {
    throw new Error("Failed to canonicalize response JSON");
  }
  const bytes = new TextEncoder().encode(canonical);
  const blob = new Blob([bytes], { type: "application/json" });
  return pinBlob(blob, `response-${json.surveyHash}.json`);
}

/**
 * Pin an encrypted survey response to IPFS. Returns the CID string.
 */
export async function pinEncryptedResponse(
  encryptedData: Uint8Array<ArrayBuffer>,
  surveyHash: string,
  blindedId: string,
): Promise<string> {
  const blob = new Blob([encryptedData], {
    type: "application/octet-stream",
  });
  return pinBlob(blob, `enc-response-${surveyHash}-${blindedId}.bin`);
}
