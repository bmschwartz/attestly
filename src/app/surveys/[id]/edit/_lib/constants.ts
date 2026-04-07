export const SURVEY_CATEGORIES = [
  "Business",
  "Education",
  "Research",
  "Health",
  "Technology",
  "Politics",
  "Entertainment",
  "Science",
  "Community",
  "Other",
] as const;

export type SurveyCategory = (typeof SURVEY_CATEGORIES)[number];

export const LIMITS = {
  TITLE_MAX: 200,
  DESCRIPTION_MAX: 2000,
  QUESTIONS_MIN: 1,
  QUESTIONS_MAX: 100,
  OPTIONS_MIN: 2,
  CATEGORIES_MIN: 1,
  CATEGORIES_MAX: 5,
  TAGS_MAX: 10,
  RATING_DEFAULT_MIN: 1,
  RATING_DEFAULT_MAX: 5,
  FREE_TEXT_DEFAULT_MAX_LENGTH: 500,
} as const;

export const RESULTS_VISIBILITY_OPTIONS = [
  { value: "PUBLIC", label: "Public", premium: false },
  { value: "RESPONDENTS", label: "Respondents Only", premium: true },
  { value: "CREATOR", label: "Creator Only", premium: true },
] as const;
