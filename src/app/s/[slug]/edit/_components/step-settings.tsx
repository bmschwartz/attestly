"use client";

import { useState, useRef, useEffect } from "react";
import type { SurveyState } from "~/app/surveys/[id]/edit/_hooks/useSurveyBuilder";
import {
  SURVEY_CATEGORIES,
  RESULTS_VISIBILITY_OPTIONS,
  LIMITS,
} from "~/app/surveys/[id]/edit/_lib/constants";

interface StepSettingsProps {
  survey: SurveyState;
  isPremium: boolean;
  onUpdateField: (
    field: keyof SurveyState,
    value: SurveyState[keyof SurveyState],
  ) => void;
  onUpdateCategories: (categories: string[]) => void;
  onUpdateTags: (tags: string[]) => void;
}

export function StepSettings({
  survey,
  isPremium,
  onUpdateField,
  onUpdateCategories,
  onUpdateTags,
}: StepSettingsProps) {
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  const toggleCategory = (cat: string) => {
    const current = survey.categories;
    if (current.includes(cat)) {
      onUpdateCategories(current.filter((c) => c !== cat));
    } else {
      if (current.length < LIMITS.CATEGORIES_MAX) {
        onUpdateCategories([...current, cat]);
      }
    }
  };

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase();
    if (!tag) return;
    if (survey.tags.includes(tag)) return;
    if (survey.tags.length >= LIMITS.TAGS_MAX) return;
    onUpdateTags([...survey.tags, tag]);
  };

  const removeTag = (tag: string) => {
    onUpdateTags(survey.tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
      setTagInput("");
    } else if (e.key === "Backspace" && !tagInput && survey.tags.length > 0) {
      removeTag(survey.tags[survey.tags.length - 1]!);
    }
  };

  // Focus tag input on mount
  useEffect(() => {
    // intentionally not auto-focusing — could be disruptive mid-wizard
  }, []);

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Categorize your survey and configure access &amp; visibility.
        </p>
      </div>

      {/* Categories */}
      <section>
        <h3 className="mb-2 text-sm font-medium text-gray-700">
          Categories{" "}
          <span className="font-normal text-gray-400">
            (select 1–{LIMITS.CATEGORIES_MAX})
          </span>
        </h3>
        <div className="flex flex-wrap gap-2">
          {SURVEY_CATEGORIES.map((cat) => {
            const selected = survey.categories.includes(cat);
            const atMax =
              survey.categories.length >= LIMITS.CATEGORIES_MAX && !selected;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                disabled={atMax}
                className={[
                  "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                  selected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : atMax
                      ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                      : "border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-600",
                ].join(" ")}
              >
                {cat}
              </button>
            );
          })}
        </div>
        {survey.categories.length === 0 && (
          <p className="mt-1.5 text-xs text-red-600">
            Select at least 1 category
          </p>
        )}
      </section>

      {/* Tags */}
      <section>
        <h3 className="mb-2 text-sm font-medium text-gray-700">
          Tags{" "}
          <span className="font-normal text-gray-400">
            (optional, max {LIMITS.TAGS_MAX})
          </span>
        </h3>
        <div
          className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500"
          onClick={() => tagInputRef.current?.focus()}
        >
          {survey.tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
            >
              {tag}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                className="text-gray-400 hover:text-gray-600"
                aria-label={`Remove tag ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
          {survey.tags.length < LIMITS.TAGS_MAX && (
            <input
              ref={tagInputRef}
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => {
                if (tagInput.trim()) {
                  addTag(tagInput);
                  setTagInput("");
                }
              }}
              placeholder={survey.tags.length === 0 ? "Type and press Enter" : ""}
              className="min-w-[120px] flex-1 border-none bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          )}
        </div>
        <p className="mt-1 text-right text-xs text-gray-400">
          {survey.tags.length}/{LIMITS.TAGS_MAX}
        </p>
      </section>

      {/* Access & Visibility */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">
          Access &amp; Visibility
        </h3>

        {/* Private toggle */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-800">
              Private survey
              {!isPremium && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                  Premium
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Hidden from public listings
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={survey.isPrivate}
            onClick={() => {
              if (isPremium) onUpdateField("isPrivate", !survey.isPrivate);
            }}
            disabled={!isPremium}
            className={[
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              survey.isPrivate && isPremium
                ? "bg-blue-600"
                : "bg-gray-200",
              !isPremium ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            ].join(" ")}
          >
            <span
              className={[
                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                survey.isPrivate ? "translate-x-6" : "translate-x-1",
              ].join(" ")}
            />
          </button>
        </div>

        {/* Invite-only toggle */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-800">
              Invite-only
              {!isPremium && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                  Premium
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Only invited respondents can participate
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={survey.accessMode === "INVITE_ONLY"}
            onClick={() => {
              if (isPremium)
                onUpdateField(
                  "accessMode",
                  survey.accessMode === "INVITE_ONLY" ? "OPEN" : "INVITE_ONLY",
                );
            }}
            disabled={!isPremium}
            className={[
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              survey.accessMode === "INVITE_ONLY" && isPremium
                ? "bg-blue-600"
                : "bg-gray-200",
              !isPremium ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            ].join(" ")}
          >
            <span
              className={[
                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                survey.accessMode === "INVITE_ONLY"
                  ? "translate-x-6"
                  : "translate-x-1",
              ].join(" ")}
            />
          </button>
        </div>

        {/* Results visibility */}
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <label
            htmlFor="results-visibility"
            className="mb-2 block text-sm font-medium text-gray-800"
          >
            Results visibility
          </label>
          <select
            id="results-visibility"
            value={survey.resultsVisibility}
            onChange={(e) =>
              onUpdateField(
                "resultsVisibility",
                e.target.value as "PUBLIC" | "RESPONDENTS" | "CREATOR",
              )
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
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
        </div>
      </section>
    </div>
  );
}
