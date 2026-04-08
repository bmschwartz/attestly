import {
  keccak256,
  encodeAbiParameters,
  type Hex,
  type AbiParameter,
} from "viem";

import type { SurveyMessage, SurveyQuestion, ResponseAnswer } from "./types";

// ---------------------------------------------------------------------------
// ABI parameter definitions for encoding
// ---------------------------------------------------------------------------

const questionAbiParams: AbiParameter[] = [
  { name: "text", type: "string" },
  { name: "questionType", type: "uint8" },
  { name: "position", type: "uint8" },
  { name: "required", type: "bool" },
  { name: "options", type: "string[]" },
  { name: "minRating", type: "uint8" },
  { name: "maxRating", type: "uint8" },
  { name: "maxLength", type: "uint16" },
];

const answerAbiParams: AbiParameter[] = [
  { name: "questionIndex", type: "uint8" },
  { name: "questionType", type: "uint8" },
  { name: "value", type: "string" },
];

const surveyAbiParams: AbiParameter[] = [
  { name: "title", type: "string" },
  { name: "description", type: "string" },
  { name: "creator", type: "address" },
  { name: "slug", type: "string" },
  { name: "isPrivate", type: "bool" },
  { name: "accessMode", type: "string" },
  { name: "resultsVisibility", type: "string" },
  { name: "questionsHash", type: "bytes32" },
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hashQuestion(q: SurveyQuestion): Hex {
  return keccak256(
    encodeAbiParameters(questionAbiParams, [
      q.text,
      q.questionType,
      q.position,
      q.required,
      q.options,
      q.minRating,
      q.maxRating,
      q.maxLength,
    ]),
  );
}

function hashQuestions(questions: SurveyQuestion[]): Hex {
  const hashes = questions.map(hashQuestion);
  return keccak256(
    encodeAbiParameters(
      [{ name: "hashes", type: "bytes32[]" }],
      [hashes],
    ),
  );
}

function hashAnswer(a: ResponseAnswer): Hex {
  return keccak256(
    encodeAbiParameters(answerAbiParams, [
      a.questionIndex,
      a.questionType,
      a.value,
    ]),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic content hash for a survey (chain-independent).
 */
export function hashSurvey(message: SurveyMessage): Hex {
  const questionsHash = hashQuestions(message.questions);

  return keccak256(
    encodeAbiParameters(surveyAbiParams, [
      message.title,
      message.description,
      message.creator,
      message.slug,
      message.isPrivate,
      message.accessMode,
      message.resultsVisibility,
      questionsHash,
    ]),
  );
}

/**
 * Compute a deterministic content hash for an array of answers.
 */
export function hashAnswers(answers: ResponseAnswer[]): Hex {
  const hashes = answers.map(hashAnswer);
  return keccak256(
    encodeAbiParameters(
      [{ name: "hashes", type: "bytes32[]" }],
      [hashes],
    ),
  );
}

/**
 * Build a SurveyMessage from component parts.
 */
export function buildSurveyMessage(
  survey: {
    title: string;
    description: string;
    slug: string;
    isPrivate: boolean;
    accessMode: string;
    resultsVisibility: string;
  },
  creator: `0x${string}`,
  questions: SurveyQuestion[],
): SurveyMessage {
  return { ...survey, creator, questions };
}
