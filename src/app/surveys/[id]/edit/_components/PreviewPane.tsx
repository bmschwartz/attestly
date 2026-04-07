"use client";

// Placeholder — implemented in Plan 2c-2
import type { SurveyState } from "../_hooks/useSurveyBuilder";
import type { QuestionDraft } from "../_lib/validation";

interface PreviewPaneProps {
  survey: SurveyState;
  questions: QuestionDraft[];
}

export function PreviewPane(_props: PreviewPaneProps) {
  return <div />;
}
