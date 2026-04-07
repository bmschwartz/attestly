"use client";

import type { QuestionDraft, ValidationError } from "../_lib/validation";
import { QuestionCard } from "./QuestionCard";

interface QuestionCardListProps {
  questions: QuestionDraft[];
  validationErrors: ValidationError[];
  onUpdateQuestion: (
    questionId: string,
    updates: Partial<QuestionDraft>,
  ) => void;
  onMoveQuestion: (questionId: string, direction: "up" | "down") => void;
  onDuplicateQuestion: (questionId: string) => void;
  onDeleteQuestion: (questionId: string) => void;
}

export function QuestionCardList({
  questions,
  validationErrors,
  onUpdateQuestion,
  onMoveQuestion,
  onDuplicateQuestion,
  onDeleteQuestion,
}: QuestionCardListProps) {
  if (questions.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
        <p className="text-sm text-gray-500">
          No questions yet. Click &quot;Add Question&quot; to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {questions.map((question, index) => (
        <QuestionCard
          key={question.id}
          question={question}
          index={index}
          totalCount={questions.length}
          validationErrors={validationErrors}
          onUpdate={(updates) => onUpdateQuestion(question.id, updates)}
          onMoveUp={() => onMoveQuestion(question.id, "up")}
          onMoveDown={() => onMoveQuestion(question.id, "down")}
          onDuplicate={() => onDuplicateQuestion(question.id)}
          onDelete={() => onDeleteQuestion(question.id)}
        />
      ))}
    </div>
  );
}
