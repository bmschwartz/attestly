"use client";

import { useCallback } from "react";
import type { QuestionDraft, ValidationError } from "../_lib/validation";
import { getErrorsForField } from "../_lib/validation";
import { OptionsEditor } from "./OptionsEditor";
import { RatingConfig } from "./RatingConfig";
import { MaxLengthConfig } from "./MaxLengthConfig";

const TYPE_LABELS: Record<QuestionDraft["questionType"], string> = {
  SINGLE_SELECT: "Single Select",
  MULTIPLE_CHOICE: "Multiple Choice",
  RATING: "Rating",
  FREE_TEXT: "Free Text",
};

const TYPE_COLORS: Record<QuestionDraft["questionType"], string> = {
  SINGLE_SELECT: "bg-purple-100 text-purple-700",
  MULTIPLE_CHOICE: "bg-green-100 text-green-700",
  RATING: "bg-amber-100 text-amber-700",
  FREE_TEXT: "bg-sky-100 text-sky-700",
};

interface QuestionCardProps {
  question: QuestionDraft;
  index: number;
  totalCount: number;
  validationErrors: ValidationError[];
  onUpdate: (updates: Partial<QuestionDraft>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function QuestionCard({
  question,
  index,
  totalCount,
  validationErrors,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: QuestionCardProps) {
  const textErrors = getErrorsForField(validationErrors, "questionText", index);
  const optionErrors = getErrorsForField(validationErrors, "options", index);
  const ratingErrors = getErrorsForField(validationErrors, "rating", index);
  const maxLengthErrors = getErrorsForField(
    validationErrors,
    "maxLength",
    index,
  );

  const hasContent =
    question.text.trim() !== "" || question.options.some((o) => o.trim() !== "");

  const handleDelete = useCallback(() => {
    if (hasContent) {
      const confirmed = window.confirm("Delete this question?");
      if (!confirmed) return;
    }
    onDelete();
  }, [hasContent, onDelete]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header: type badge */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500">
            Q{index + 1}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLORS[question.questionType]}`}
          >
            {TYPE_LABELS[question.questionType]}
          </span>
        </div>
      </div>

      {/* Question text */}
      <div className="mb-3">
        <input
          type="text"
          value={question.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          placeholder="Enter question text..."
          className={`block w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            textErrors.length > 0
              ? "border-red-300 focus:ring-red-500"
              : "border-gray-300"
          }`}
        />
        {textErrors.map((err) => (
          <p key={err} className="mt-1 text-xs text-red-600">{err}</p>
        ))}
      </div>

      {/* Type-specific editor */}
      {(question.questionType === "SINGLE_SELECT" ||
        question.questionType === "MULTIPLE_CHOICE") && (
        <OptionsEditor
          options={question.options}
          onChange={(options) => onUpdate({ options })}
          errors={optionErrors}
        />
      )}

      {question.questionType === "RATING" && (
        <RatingConfig
          minRating={question.minRating}
          maxRating={question.maxRating}
          onChangeMin={(value) => onUpdate({ minRating: value })}
          onChangeMax={(value) => onUpdate({ maxRating: value })}
          errors={ratingErrors}
        />
      )}

      {question.questionType === "FREE_TEXT" && (
        <MaxLengthConfig
          maxLength={question.maxLength}
          onChange={(value) => onUpdate({ maxLength: value })}
          errors={maxLengthErrors}
        />
      )}

      {/* Required toggle and controls */}
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(e) => onUpdate({ required: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Required
        </label>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:invisible"
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === totalCount - 1}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:invisible"
            title="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Duplicate"
          >
            ⧉
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-500"
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
