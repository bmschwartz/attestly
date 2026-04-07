"use client";

import type { SurveyState } from "../_hooks/useSurveyBuilder";
import type { QuestionDraft } from "../_lib/validation";

interface PreviewPaneProps {
  survey: SurveyState;
  questions: QuestionDraft[];
}

export function PreviewPane({ survey, questions }: PreviewPaneProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-gray-400">
        Preview
      </div>

      {/* Survey header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">
          {survey.title || "Untitled Survey"}
        </h2>
        {survey.description && (
          <p className="mt-2 text-sm text-gray-600">{survey.description}</p>
        )}
      </div>

      {/* Questions */}
      {questions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-400">
            Questions will appear here as you add them
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {questions.map((question, index) => (
            <PreviewQuestion
              key={question.id}
              question={question}
              number={index + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewQuestion({
  question,
  number,
}: {
  question: QuestionDraft;
  number: number;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <span className="text-sm font-medium text-gray-900">
          {number}.{" "}
          {question.text || (
            <span className="italic text-gray-400">Question text...</span>
          )}
          {question.required && (
            <span className="ml-1 text-red-500">*</span>
          )}
        </span>
      </div>

      {question.questionType === "SINGLE_SELECT" && (
        <PreviewSingleSelect options={question.options} />
      )}

      {question.questionType === "MULTIPLE_CHOICE" && (
        <PreviewMultipleChoice options={question.options} />
      )}

      {question.questionType === "RATING" && (
        <PreviewRating
          min={question.minRating ?? 1}
          max={question.maxRating ?? 5}
        />
      )}

      {question.questionType === "FREE_TEXT" && (
        <PreviewFreeText maxLength={question.maxLength ?? 500} />
      )}
    </div>
  );
}

function PreviewSingleSelect({ options }: { options: string[] }) {
  return (
    <div className="space-y-2">
      {options.map((option, i) => (
        <label
          key={i}
          className="flex items-center gap-2 text-sm text-gray-700"
        >
          <div className="h-4 w-4 rounded-full border border-gray-300" />
          {option || (
            <span className="italic text-gray-400">Option {i + 1}</span>
          )}
        </label>
      ))}
    </div>
  );
}

function PreviewMultipleChoice({ options }: { options: string[] }) {
  return (
    <div className="space-y-2">
      {options.map((option, i) => (
        <label
          key={i}
          className="flex items-center gap-2 text-sm text-gray-700"
        >
          <div className="h-4 w-4 rounded border border-gray-300" />
          {option || (
            <span className="italic text-gray-400">Option {i + 1}</span>
          )}
        </label>
      ))}
    </div>
  );
}

function PreviewRating({ min, max }: { min: number; max: number }) {
  const range = max - min + 1;

  if (range <= 10 && range > 0) {
    const buttons = Array.from({ length: range }, (_, i) => min + i);
    return (
      <div className="flex gap-2">
        {buttons.map((num) => (
          <div
            key={num}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-sm text-gray-600"
          >
            {num}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        disabled
        placeholder={`${min}-${max}`}
        className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-400"
      />
      <span className="text-xs text-gray-400">
        ({min} to {max})
      </span>
    </div>
  );
}

function PreviewFreeText({ maxLength }: { maxLength: number }) {
  return (
    <div>
      <div className="rounded-lg border border-gray-300 bg-gray-50 p-3">
        <p className="text-sm italic text-gray-400">
          Respondents will type their answer here...
        </p>
      </div>
      <p className="mt-1 text-right text-xs text-gray-400">
        0/{maxLength} characters
      </p>
    </div>
  );
}
