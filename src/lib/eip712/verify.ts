import { verifyTypedData, recoverTypedDataAddress } from "viem";

import { getAttestlyDomain, assertDomainConfigured } from "./domain";
import {
  publishSurveyTypes,
  submitResponseTypes,
  type PublishSurveySigningMessage,
  type SubmitResponseSigningMessage,
} from "./types";

// ---------------------------------------------------------------------------
// Recover signer address
// ---------------------------------------------------------------------------

export async function recoverSurveySigner(
  message: PublishSurveySigningMessage,
  signature: `0x${string}`,
): Promise<`0x${string}`> {
  assertDomainConfigured();
  return recoverTypedDataAddress({
    domain: getAttestlyDomain(),
    types: publishSurveyTypes,
    primaryType: "PublishSurvey",
    message,
    signature,
  });
}

export async function recoverResponseSigner(
  message: SubmitResponseSigningMessage,
  signature: `0x${string}`,
): Promise<`0x${string}`> {
  assertDomainConfigured();
  return recoverTypedDataAddress({
    domain: getAttestlyDomain(),
    types: submitResponseTypes,
    primaryType: "SubmitResponse",
    message,
    signature,
  });
}

// ---------------------------------------------------------------------------
// Verify signature matches expected address
// ---------------------------------------------------------------------------

export async function verifySurveySignature(
  message: PublishSurveySigningMessage,
  signature: `0x${string}`,
  expectedAddress: `0x${string}`,
): Promise<boolean> {
  return verifyTypedData({
    address: expectedAddress,
    domain: getAttestlyDomain(),
    types: publishSurveyTypes,
    primaryType: "PublishSurvey",
    message,
    signature,
  });
}

export async function verifyResponseSignature(
  message: SubmitResponseSigningMessage,
  signature: `0x${string}`,
  expectedAddress: `0x${string}`,
): Promise<boolean> {
  return verifyTypedData({
    address: expectedAddress,
    domain: getAttestlyDomain(),
    types: submitResponseTypes,
    primaryType: "SubmitResponse",
    message,
    signature,
  });
}
