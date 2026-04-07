"use client";

// Placeholder — implemented in Plan 2c-2
import type { SurveyState } from "../_hooks/useSurveyBuilder";
import type { ValidationError } from "../_lib/validation";

interface SurveyMetadataFormProps {
  survey: SurveyState;
  validationErrors: ValidationError[];
  onUpdateField: (
    field: keyof SurveyState,
    value: SurveyState[keyof SurveyState],
  ) => void;
  onUpdateCategories: (categories: string[]) => void;
  onUpdateTags: (tags: string[]) => void;
  isPremium: boolean;
}

export function SurveyMetadataForm(_props: SurveyMetadataFormProps) {
  return <div />;
}
