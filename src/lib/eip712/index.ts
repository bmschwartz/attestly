// Domain
export { getAttestlyDomain } from "./domain";

// Types
export {
  publishSurveyTypes,
  submitResponseTypes,
  closeSurveyTypes,
  surveyContentTypes,
  responseContentTypes,
} from "./types";
export type {
  SurveyQuestion,
  SurveyMessage,
  ResponseAnswer,
  SurveyResponseMessage,
  PublishSurveySigningMessage,
  SubmitResponseSigningMessage,
} from "./types";

// Hashing
export { hashSurvey, hashAnswers, buildSurveyMessage } from "./hash";

// Signing (client-side)
export {
  signSurvey,
  signSurveyResponse,
  signCloseSurvey,
  createPrivyWalletClient,
} from "./sign";
export type { CloseSurveyMessage } from "./sign";

// Verification (server-side)
export {
  recoverSurveySigner,
  recoverResponseSigner,
  verifySurveySignature,
  verifyResponseSignature,
} from "./verify";

// Blinded ID
export { computeBlindedId } from "./blinded-id";
