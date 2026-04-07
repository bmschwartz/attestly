"use client";

// Placeholder — implemented in Plan 2c-2
import type { QuestionDraft, ValidationError } from "../_lib/validation";

interface QuestionCardListProps {
  questions: QuestionDraft[];
  validationErrors: ValidationError[];
  onUpdateQuestion: (questionId: string, updates: Partial<QuestionDraft>) => void;
  onMoveQuestion: (questionId: string, direction: "up" | "down") => void;
  onDuplicateQuestion: (questionId: string) => void;
  onDeleteQuestion: (questionId: string) => void;
}

export function QuestionCardList(_props: QuestionCardListProps) {
  return <div />;
}
