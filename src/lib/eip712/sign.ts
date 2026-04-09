"use client";

import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { base } from "viem/chains";

import { getAttestlyDomain, assertDomainConfigured } from "./domain";
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
}

/**
 * Accept any EIP-1193 compatible provider.
 * Privy's EIP1193Provider type is structurally compatible but nominally
 * different from viem's, so we use a minimal structural type to bridge them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEIP1193Provider = { request: (...args: any[]) => Promise<any> };

// ---------------------------------------------------------------------------
// Wallet client helper
// ---------------------------------------------------------------------------

export function createPrivyWalletClient(provider: AnyEIP1193Provider) {
  return createWalletClient({
    chain: base,
    transport: custom(provider as EIP1193Provider),
  });
}

// ---------------------------------------------------------------------------
// Signing functions
// ---------------------------------------------------------------------------

export async function signSurvey(
  provider: AnyEIP1193Provider,
  account: `0x${string}`,
  message: PublishSurveySigningMessage,
): Promise<`0x${string}`> {
  assertDomainConfigured();
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
  provider: AnyEIP1193Provider,
  account: `0x${string}`,
  message: SubmitResponseSigningMessage,
): Promise<`0x${string}`> {
  assertDomainConfigured();
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
  provider: AnyEIP1193Provider,
  account: `0x${string}`,
  message: CloseSurveyMessage,
): Promise<`0x${string}`> {
  assertDomainConfigured();
  const client = createPrivyWalletClient(provider);
  return client.signTypedData({
    account,
    domain: getAttestlyDomain(),
    types: closeSurveyTypes,
    primaryType: "CloseSurvey",
    message,
  });
}
