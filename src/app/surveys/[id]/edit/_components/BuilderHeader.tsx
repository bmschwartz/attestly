"use client";

import { useState } from "react";
import type { SaveStatus } from "../_hooks/useAutoSave";
import type { SurveyState } from "../_hooks/useSurveyBuilder";
import type { QuestionDraft, ValidationError } from "../_lib/validation";
import { PublishDialog } from "./PublishDialog";

interface BuilderHeaderProps {
  saveStatus: SaveStatus;
  surveyId: string;
  survey: SurveyState;
  questions: QuestionDraft[];
  validationErrors: ValidationError[];
  onPublish: () => boolean;
}

const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  saved: "All changes saved",
  saving: "Saving...",
  error: "Save failed",
};

const SAVE_STATUS_COLORS: Record<SaveStatus, string> = {
  saved: "text-green-600",
  saving: "text-gray-500",
  error: "text-red-600",
};

export function BuilderHeader({
  saveStatus,
  surveyId,
  survey: _survey,
  questions: _questions,
  validationErrors,
  onPublish,
}: BuilderHeaderProps) {
  const [showPublishDialog, setShowPublishDialog] = useState(false);

  const handlePublishClick = () => {
    const valid = onPublish();
    if (valid) {
      setShowPublishDialog(true);
    }
  };

  return (
    <header className="relative flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-gray-900">
          Survey Builder
        </h1>
        <span className={`text-sm ${SAVE_STATUS_COLORS[saveStatus]}`}>
          {SAVE_STATUS_LABELS[saveStatus]}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handlePublishClick}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Publish
        </button>
      </div>

      {/* Validation errors shown as a banner below the header */}
      {validationErrors.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-40 border-b border-red-200 bg-red-50 px-6 py-3">
          <p className="text-sm font-medium text-red-800">
            Please fix the following before publishing:
          </p>
          <ul className="mt-1 list-inside list-disc text-sm text-red-700">
            {validationErrors.map((err, i) => (
              <li key={i}>{err.message}</li>
            ))}
          </ul>
        </div>
      )}

      {showPublishDialog && (
        <PublishDialog
          onClose={() => setShowPublishDialog(false)}
          surveyId={surveyId}
        />
      )}
    </header>
  );
}
