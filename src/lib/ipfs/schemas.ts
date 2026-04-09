import { z } from "zod";

// ── IPFS Survey Schemas ──────────────────────────────────────────────

export const ipfsSurveyQuestionSchema = z.object({
  text: z.string().min(1),
  questionType: z.number().int().min(0).max(255),
  position: z.number().int().min(0).max(255),
  required: z.boolean(),
  options: z.array(z.string()),  // required, empty array for non-select types
  minRating: z.number().int().min(0).max(255),  // required, 0 default for non-rating types
  maxRating: z.number().int().min(0).max(255),
  maxLength: z.number().int().min(0).max(65535),
});

export const ipfsSurveySchema = z.object({
  version: z.literal("1"),
  title: z.string().min(1),
  description: z.string(),
  creator: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  slug: z.string().min(1),
  isPrivate: z.boolean(),
  accessMode: z.string().min(1),
  resultsVisibility: z.string().min(1),
  questions: z.array(ipfsSurveyQuestionSchema).min(1),
});

export type IpfsSurveyJSON = z.infer<typeof ipfsSurveySchema>;

// ── IPFS Response Schemas ────────────────────────────────────────────

export const ipfsResponseAnswerSchema = z.object({
  questionIndex: z.number().int().min(0).max(255),
  questionType: z.number().int().min(0).max(255),
  value: z.string(),
});

export const ipfsResponseSchema = z.object({
  version: z.literal("1"),
  surveyHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  respondent: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  answers: z.array(ipfsResponseAnswerSchema).min(1),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export type IpfsResponseJSON = z.infer<typeof ipfsResponseSchema>;
