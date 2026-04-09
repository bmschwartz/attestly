import { PinataSDK } from "pinata";

// Lazy singleton – only created on first use so env vars are not required at import time.
let client: PinataSDK | null = null;

function getClient(): PinataSDK {
  if (!client) {
    const jwt = process.env.PINATA_JWT;
    const gateway = process.env.PINATA_GATEWAY_URL;
    if (!jwt || !gateway) {
      throw new Error(
        "PINATA_JWT and PINATA_GATEWAY_URL must be set to use IPFS features",
      );
    }
    client = new PinataSDK({
      pinataJwt: jwt,
      pinataGateway: gateway,
    });
  }
  return client;
}

/**
 * @internal — Use pinBlob with canonicalized bytes for deterministic CIDs.
 * This function uses the SDK's internal serialization which is NOT deterministic.
 */
export async function pinJSON(
  data: Record<string, unknown>,
  name?: string,
): Promise<string> {
  const sdk = getClient();
  const upload = await sdk.upload.public.json(data);
  // name is used for metadata if the SDK supports it; current SDK ignores it in .json()
  void name;
  return upload.cid;
}

/**
 * Pin a Blob (raw bytes) to IPFS. Returns the CID string.
 * @param blob The data to pin
 * @param name Filename for the upload
 * @param groupId Optional Pinata group ID for organizing pins
 */
export async function pinBlob(
  blob: Blob,
  name?: string,
  groupId?: string,
): Promise<string> {
  const sdk = getClient();
  const file = new File([blob], name ?? "data.bin", { type: blob.type });
  let upload = sdk.upload.public.file(file);
  if (groupId) {
    upload = upload.group(groupId);
  }
  const result = await upload;
  return result.cid;
}

/**
 * Retrieve content from IPFS by CID and return it as a string.
 */
export async function getContent(cid: string): Promise<string> {
  const sdk = getClient();
  const result = await sdk.gateways.public.get(cid);
  // result.data can be a string, buffer, or object depending on content type
  const data = result.data as string | Buffer | Record<string, unknown>;
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf-8");
  return JSON.stringify(data);
}

/**
 * Retrieve JSON content from IPFS by CID and return the parsed object.
 */
export async function getJSON<T = unknown>(cid: string): Promise<T> {
  const content = await getContent(cid);
  return JSON.parse(content) as T;
}

/**
 * Convert a CID to a full gateway URL.
 */
export async function getGatewayUrl(cid: string): Promise<string> {
  const sdk = getClient();
  return sdk.gateways.public.convert(cid);
}
