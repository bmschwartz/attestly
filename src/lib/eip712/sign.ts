"use client";

import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { base } from "viem/chains";

import { getAttestlyDomain } from "./domain";
import {
  publishSurveyTypes,
  submitResponseTypes,
  closeSurveyTypes,
  type PublishSurveySigningMessage,
  type SubmitResponseSigningMessage,
} from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CloseSurveyMessage {
  surveyHash: `0x${string}`;
  creator: `0x${string}`;
}

// ---------------------------------------------------------------------------
// Wallet client helper
// ---------------------------------------------------------------------------

export function createPrivyWalletClient(provider: EIP1193Provider) {
  return createWalletClient({
    chain: base,
    transport: custom(provider),
  });
}

// ---------------------------------------------------------------------------
// Signing functions
// ---------------------------------------------------------------------------

export async function signSurvey(
  provider: EIP1193Provider,
  account: `0x${string}`,
  message: PublishSurveySigningMessage,
): Promise<`0x${string}`> {
  const client = createPrivyWalletClient(provider);
  return client.signTypedData({
    account,
    domain: getAttestlyDomain(),
    types: publishSurveyTypes,
    primaryType: "PublishSurvey",
    message,
  });
}

export async function signSurveyResponse(
  provider: EIP1193Provider,
  account: `0x${string}`,
  message: SubmitResponseSigningMessage,
): Promise<`0x${string}`> {
  const client = createPrivyWalletClient(provider);
  return client.signTypedData({
    account,
    domain: getAttestlyDomain(),
    types: submitResponseTypes,
    primaryType: "SubmitResponse",
    message,
  });
}

export async function signCloseSurvey(
  provider: EIP1193Provider,
  account: `0x${string}`,
  message: CloseSurveyMessage,
): Promise<`0x${string}`> {
  const client = createPrivyWalletClient(provider);
  return client.signTypedData({
    account,
    domain: getAttestlyDomain(),
    types: closeSurveyTypes,
    primaryType: "CloseSurvey",
    message,
  });
}
