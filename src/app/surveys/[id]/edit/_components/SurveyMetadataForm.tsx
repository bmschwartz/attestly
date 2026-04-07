"use client";

import { useCallback, useState } from "react";
import type { SurveyState } from "../_hooks/useSurveyBuilder";
import type { ValidationError } from "../_lib/validation";
import {
  SURVEY_CATEGORIES,
  LIMITS,
  RESULTS_VISIBILITY_OPTIONS,
} from "../_lib/constants";
import { getErrorsForField } from "../_lib/validation";

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

export function SurveyMetadataForm({
  survey,
  validationErrors,
  onUpdateField,
  onUpdateCategories,
  onUpdateTags,
  isPremium,
}: SurveyMetadataFormProps) {
  const [tagInput, setTagInput] = useState("");

  const titleErrors = getErrorsForField(validationErrors, "title");
  const descriptionErrors = getErrorsForField(validationErrors, "description");
  const categoryErrors = getErrorsForField(validationErrors, "categories");
  const tagErrors = getErrorsForField(validationErrors, "tags");

  const handleCategoryToggle = useCallback(
    (category: string) => {
      const current = survey.categories;
      if (current.includes(category)) {
        onUpdateCategories(current.filter((c) => c !== category));
      } else if (current.length < LIMITS.CATEGORIES_MAX) {
        onUpdateCategories([...current, category]);
      }
    },
    [survey.categories, onUpdateCategories],
  );

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const tag = tagInput.trim().toLowerCase();
        if (tag && !survey.tags.includes(tag) && survey.tags.length < LIMITS.TAGS_MAX) {
          onUpdateTags([...survey.tags, tag]);
        }
        setTagInput("");
      }
    },
    [tagInput, survey.tags, onUpdateTags],
  );

  const handleRemoveTag = useCallback(
    (tag: string) => {
      onUpdateTags(survey.tags.filter((t) => t !== tag));
    },
    [survey.tags, onUpdateTags],
  );

  return (
    <div className="space-y-5">
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={survey.title}
          onChange={(e) => onUpdateField("title", e.target.value)}
          maxLength={LIMITS.TITLE_MAX}
          placeholder="Survey title"
          className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            titleErrors.length > 0
              ? "border-red-300 focus:ring-red-500"
              : "border-gray-300"
          }`}
        />
        <div className="mt-1 flex justify-between">
          {titleErrors.map((err) => (
            <p key={err} className="text-xs text-red-600">{err}</p>
          ))}
          <span className="text-xs text-gray-400">
            {survey.title.length}/{LIMITS.TITLE_MAX}
          </span>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          value={survey.description}
          onChange={(e) => onUpdateField("description", e.target.value)}
          maxLength={LIMITS.DESCRIPTION_MAX}
          rows={4}
          placeholder="Describe what this survey is about..."
          className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            descriptionErrors.length > 0
              ? "border-red-300 focus:ring-red-500"
              : "border-gray-300"
          }`}
        />
        <div className="mt-1 flex justify-between">
          {descriptionErrors.map((err) => (
            <p key={err} className="text-xs text-red-600">{err}</p>
          ))}
          <span className="text-xs text-gray-400">
            {survey.description.length}/{LIMITS.DESCRIPTION_MAX}
          </span>
        </div>
      </div>

      {/* Slug — hidden from creator, system-generated */}

      {/* Private toggle (premium gated) */}
      <div className="flex items-center gap-3">
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={survey.isPrivate}
            onChange={(e) => onUpdateField("isPrivate", e.target.checked)}
            disabled={!isPremium}
            className="peer sr-only"
          />
          <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-disabled:opacity-50" />
        </label>
        <span className="text-sm text-gray-700">
          Private survey
          {!isPremium && (
            <span className="ml-1 text-xs text-gray-400" title="Make responses private and control who sees results — available on Premium">
              🔒 Premium
            </span>
          )}
        </span>
      </div>

      {/* Invite-only toggle (premium gated) */}
      <div className="flex items-center gap-3">
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={survey.accessMode === "INVITE_ONLY"}
            onChange={(e) =>
              onUpdateField("accessMode", e.target.checked ? "INVITE_ONLY" : "OPEN")
            }
            disabled={!isPremium}
            className="peer sr-only"
          />
          <div className="peer h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-disabled:opacity-50" />
        </label>
        <span className="text-sm text-gray-700">
          Invite-only
          {!isPremium && (
            <span className="ml-1 text-xs text-gray-400" title="Restrict responses to invited participants — available on Premium">
              🔒 Premium
            </span>
          )}
        </span>
      </div>

      {/* Results visibility */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Results Visibility
        </label>
        <select
          value={survey.resultsVisibility}
          onChange={(e) =>
            onUpdateField(
              "resultsVisibility",
              e.target.value as SurveyState["resultsVisibility"],
            )
          }
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {RESULTS_VISIBILITY_OPTIONS.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              disabled={opt.premium && !isPremium}
            >
              {opt.label}
              {opt.premium && !isPremium ? " (Premium)" : ""}
            </option>
          ))}
        </select>
        {!isPremium && (
          <p className="mt-1 text-xs text-gray-400">
            Control who sees your results — Respondents Only and Creator Only available on Premium
          </p>
        )}
      </div>

      {/* Categories */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Categories <span className="text-red-500">*</span>
          <span className="ml-1 text-xs font-normal text-gray-400">
            ({survey.categories.length}/{LIMITS.CATEGORIES_MAX})
          </span>
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {SURVEY_CATEGORIES.map((category) => {
            const selected = survey.categories.includes(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => handleCategoryToggle(category)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  selected
                    ? "bg-blue-100 text-blue-700 ring-1 ring-blue-500"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>
        {categoryErrors.map((err) => (
          <p key={err} className="mt-1 text-xs text-red-600">{err}</p>
        ))}
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Tags
          <span className="ml-1 text-xs font-normal text-gray-400">
            ({survey.tags.length}/{LIMITS.TAGS_MAX})
          </span>
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-gray-300 p-2">
          {survey.tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-sm text-gray-700"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="text-gray-400 hover:text-gray-600"
              >
                x
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder={
              survey.tags.length >= LIMITS.TAGS_MAX
                ? "Max tags reached"
                : "Add a tag..."
            }
            disabled={survey.tags.length >= LIMITS.TAGS_MAX}
            className="min-w-[120px] flex-1 border-0 p-0 text-sm focus:outline-none focus:ring-0"
          />
        </div>
        {tagErrors.map((err) => (
          <p key={err} className="mt-1 text-xs text-red-600">{err}</p>
        ))}
      </div>
    </div>
  );
}
