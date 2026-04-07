"use client";

// Placeholder — implemented in Plan 2c-2
import type { QuestionDraft } from "../_lib/validation";

interface AddQuestionButtonProps {
  onAddQuestion: (questionType: QuestionDraft["questionType"]) => void;
}

export function AddQuestionButton(_props: AddQuestionButtonProps) {
  return <div />;
}
