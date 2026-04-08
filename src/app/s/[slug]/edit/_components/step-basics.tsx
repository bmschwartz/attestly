"use client";

import type { SurveyState } from "~/app/surveys/[id]/edit/_hooks/useSurveyBuilder";
import { LIMITS } from "~/app/surveys/[id]/edit/_lib/constants";

interface StepBasicsProps {
  survey: SurveyState;
  onUpdateField: (
    field: keyof SurveyState,
    value: SurveyState[keyof SurveyState],
  ) => void;
}

export function StepBasics({ survey, onUpdateField }: StepBasicsProps) {
  const titleLen = survey.title.length;
  const descLen = survey.description.length;

  const titleTooLong = titleLen > LIMITS.TITLE_MAX;
  const descTooLong = descLen > LIMITS.DESCRIPTION_MAX;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Basics</h2>
        <p className="mt-1 text-sm text-gray-500">
          Give your survey a clear title and an optional description.
        </p>
      </div>

      {/* Title */}
      <div>
        <label
          htmlFor="basics-title"
          className="mb-1.5 block text-sm font-medium text-gray-700"
        >
          Survey Title <span className="text-red-500">*</span>
        </label>
        <input
          id="basics-title"
          type="text"
          value={survey.title}
          onChange={(e) => onUpdateField("title", e.target.value)}
          maxLength={LIMITS.TITLE_MAX + 20}
          placeholder="e.g. Customer Satisfaction Survey"
          className={[
            "w-full rounded-lg border px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500",
            titleTooLong
              ? "border-red-400 focus:ring-red-400"
              : "border-gray-300 focus:border-blue-500",
          ].join(" ")}
        />
        <div className="mt-1 flex items-center justify-between">
          {titleTooLong ? (
            <p className="text-xs text-red-600">
              Title must be {LIMITS.TITLE_MAX} characters or fewer
            </p>
          ) : (
            <span />
          )}
          <p
            className={[
              "text-xs",
              titleTooLong ? "text-red-500" : "text-gray-400",
            ].join(" ")}
          >
            {titleLen}/{LIMITS.TITLE_MAX}
          </p>
        </div>
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="basics-description"
          className="mb-1.5 block text-sm font-medium text-gray-700"
        >
          Description{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          id="basics-description"
          value={survey.description}
          onChange={(e) => onUpdateField("description", e.target.value)}
          maxLength={LIMITS.DESCRIPTION_MAX + 100}
          placeholder="Describe what this survey is about and why respondents should participate."
          rows={5}
          className={[
            "w-full rounded-lg border px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500",
            descTooLong
              ? "border-red-400 focus:ring-red-400"
              : "border-gray-300 focus:border-blue-500",
          ].join(" ")}
        />
        <div className="mt-1 flex items-center justify-between">
          {descTooLong ? (
            <p className="text-xs text-red-600">
              Description must be {LIMITS.DESCRIPTION_MAX} characters or fewer
            </p>
          ) : (
            <span />
          )}
          <p
            className={[
              "text-xs",
              descTooLong ? "text-red-500" : "text-gray-400",
            ].join(" ")}
          >
            {descLen}/{LIMITS.DESCRIPTION_MAX}
          </p>
        </div>
      </div>
    </div>
  );
}
