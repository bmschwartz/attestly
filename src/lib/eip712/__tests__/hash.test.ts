import { describe, it, expect } from "vitest";
import { hashSurvey, hashAnswers, buildSurveyMessage } from "../hash";
import type { SurveyMessage, ResponseAnswer, SurveyQuestion } from "../types";

const sampleQuestions: SurveyQuestion[] = [
  {
    text: "How satisfied are you?",
    questionType: 1,
    position: 0,
    required: true,
    options: ["Very", "Somewhat", "Not at all"],
    minRating: 0,
    maxRating: 0,
    maxLength: 0,
  },
  {
    text: "Any feedback?",
    questionType: 2,
    position: 1,
    required: false,
    options: [],
    minRating: 0,
    maxRating: 0,
    maxLength: 500,
  },
];

const sampleSurvey: SurveyMessage = {
  title: "Test Survey",
  description: "A test survey",
  creator: "0x1234567890abcdef1234567890abcdef12345678",
  slug: "test-survey",
  isPrivate: false,
  accessMode: "open",
  resultsVisibility: "public",
  questions: sampleQuestions,
};

const sampleAnswers: ResponseAnswer[] = [
  { questionIndex: 0, questionType: 1, value: "Very" },
  { questionIndex: 1, questionType: 2, value: "Great survey!" },
];

describe("hashSurvey", () => {
  it("returns a valid hex string", () => {
    const hash = hashSurvey(sampleSurvey);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const hash1 = hashSurvey(sampleSurvey);
    const hash2 = hashSurvey(sampleSurvey);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different inputs", () => {
    const modified: SurveyMessage = { ...sampleSurvey, title: "Different" };
    const hash1 = hashSurvey(sampleSurvey);
    const hash2 = hashSurvey(modified);
    expect(hash1).not.toBe(hash2);
  });

  it("works with buildSurveyMessage helper", () => {
    const msg = buildSurveyMessage(
      {
        title: "Test Survey",
        description: "A test survey",
        slug: "test-survey",
        isPrivate: false,
        accessMode: "open",
        resultsVisibility: "public",
      },
      "0x1234567890abcdef1234567890abcdef12345678",
      sampleQuestions,
    );
    const hash = hashSurvey(msg);
    expect(hash).toBe(hashSurvey(sampleSurvey));
  });
});

describe("hashAnswers", () => {
  it("returns a valid hex string", () => {
    const hash = hashAnswers(sampleAnswers);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const hash1 = hashAnswers(sampleAnswers);
    const hash2 = hashAnswers(sampleAnswers);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different inputs", () => {
    const modified: ResponseAnswer[] = [
      { questionIndex: 0, questionType: 1, value: "Somewhat" },
      { questionIndex: 1, questionType: 2, value: "Great survey!" },
    ];
    const hash1 = hashAnswers(sampleAnswers);
    const hash2 = hashAnswers(modified);
    expect(hash1).not.toBe(hash2);
  });
});
