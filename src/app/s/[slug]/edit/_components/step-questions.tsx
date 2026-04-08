"use client";

import type { QuestionDraft, ValidationError } from "~/app/surveys/[id]/edit/_lib/validation";
import { QuestionCardList } from "~/app/surveys/[id]/edit/_components/QuestionCardList";
import { AddQuestionButton } from "~/app/surveys/[id]/edit/_components/AddQuestionButton";
import { LIMITS } from "~/app/surveys/[id]/edit/_lib/constants";

interface StepQuestionsProps {
  questions: QuestionDraft[];
  validationErrors: ValidationError[];
  onUpdateQuestion: (
    questionId: string,
    updates: Partial<QuestionDraft>,
  ) => void;
  onAddQuestion: (type: QuestionDraft["questionType"]) => void;
  onMoveQuestion: (questionId: string, direction: "up" | "down") => void;
  onDuplicateQuestion: (questionId: string) => void;
  onDeleteQuestion: (questionId: string) => void;
}

export function StepQuestions({
  questions,
  validationErrors,
  onUpdateQuestion,
  onAddQuestion,
  onMoveQuestion,
  onDuplicateQuestion,
  onDeleteQuestion,
}: StepQuestionsProps) {
  const count = questions.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Questions</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Add between {LIMITS.QUESTIONS_MIN} and {LIMITS.QUESTIONS_MAX}{" "}
            questions.{" "}
            <span
              className={
                count > LIMITS.QUESTIONS_MAX
                  ? "font-medium text-red-600"
                  : "text-gray-400"
              }
            >
              {count} / {LIMITS.QUESTIONS_MAX}
            </span>
          </p>
        </div>
      </div>

      {/* Question list */}
      <QuestionCardList
        questions={questions}
        validationErrors={validationErrors}
        onUpdateQuestion={onUpdateQuestion}
        onMoveQuestion={onMoveQuestion}
        onDuplicateQuestion={onDuplicateQuestion}
        onDeleteQuestion={onDeleteQuestion}
      />

      {/* Add question */}
      {count < LIMITS.QUESTIONS_MAX && (
        <AddQuestionButton onAddQuestion={onAddQuestion} />
      )}
    </div>
  );
}
