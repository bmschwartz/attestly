// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export interface SurveyQuestion {
  text: string;
  questionType: number;
  position: number;
  required: boolean;
  options: string[];
  minRating: number;
  maxRating: number;
  maxLength: number;
}

export interface SurveyMessage {
  title: string;
  description: string;
  creator: `0x${string}`;
  slug: string;
  isPrivate: boolean;
  accessMode: string;
  resultsVisibility: string;
  questions: SurveyQuestion[];
}

export interface ResponseAnswer {
  questionIndex: number;
  questionType: number;
  value: string;
}

export interface SurveyResponseMessage {
  surveyHash: `0x${string}`;
  respondent: `0x${string}`;
  answers: ResponseAnswer[];
}

export interface PublishSurveySigningMessage {
  surveyHash: `0x${string}`;
  title: string;
  slug: string;
  questionCount: number;
  creator: `0x${string}`;
}

export interface SubmitResponseSigningMessage {
  surveyHash: `0x${string}`;
  blindedId: `0x${string}`;
  answerCount: number;
  answersHash: `0x${string}`;
}

// ---------------------------------------------------------------------------
// EIP-712 compact signing types (what users actually sign)
// ---------------------------------------------------------------------------

export const publishSurveyTypes = {
  PublishSurvey: [
    { name: "surveyHash", type: "bytes32" },
    { name: "title", type: "string" },
    { name: "slug", type: "string" },
    { name: "questionCount", type: "uint8" },
    { name: "creator", type: "address" },
  ],
} as const;

export const submitResponseTypes = {
  SubmitResponse: [
    { name: "surveyHash", type: "bytes32" },
    { name: "blindedId", type: "bytes32" },
    { name: "answerCount", type: "uint8" },
    { name: "answersHash", type: "bytes32" },
  ],
} as const;

export const closeSurveyTypes = {
  CloseSurvey: [
    { name: "surveyHash", type: "bytes32" },
  ],
} as const;

// ---------------------------------------------------------------------------
// Full content types (used for hash pre-computation, NOT for signing)
// ---------------------------------------------------------------------------

export const surveyContentTypes = {
  Survey: [
    { name: "title", type: "string" },
    { name: "description", type: "string" },
    { name: "creator", type: "address" },
    { name: "slug", type: "string" },
    { name: "isPrivate", type: "bool" },
    { name: "accessMode", type: "string" },
    { name: "resultsVisibility", type: "string" },
    { name: "questions", type: "Question[]" },
  ],
  Question: [
    { name: "text", type: "string" },
    { name: "questionType", type: "uint8" },
    { name: "position", type: "uint8" },
    { name: "required", type: "bool" },
    { name: "options", type: "string[]" },
    { name: "minRating", type: "uint8" },
    { name: "maxRating", type: "uint8" },
    { name: "maxLength", type: "uint16" },
  ],
} as const;

export const responseContentTypes = {
  SurveyResponse: [
    { name: "surveyHash", type: "bytes32" },
    { name: "respondent", type: "address" },
    { name: "answers", type: "Answer[]" },
  ],
  Answer: [
    { name: "questionIndex", type: "uint8" },
    { name: "questionType", type: "uint8" },
    { name: "value", type: "string" },
  ],
} as const;
