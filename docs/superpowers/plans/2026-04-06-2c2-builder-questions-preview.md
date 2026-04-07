# Sub-Plan 2c-2: Survey Builder Questions, Preview & Wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the question-type editors (SurveyMetadataForm, QuestionCard, OptionsEditor, RatingConfig, MaxLengthConfig), the live PreviewPane, the AddQuestionButton, QuestionCardList, and wire everything together in SurveyBuilderClient.

**Assumes:** Plan 2c-1 is complete — page shell, hooks (useSurveyBuilder, useAutoSave), BuilderHeader, BuilderFooter, PublishDialog, constants, and validation are all implemented.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, tRPC 11, TypeScript 6

**Spec reference:** `docs/superpowers/specs/2026-04-05-survey-builder-design.md`

---

## File Structure

- Create: `src/app/surveys/[id]/edit/_components/SurveyMetadataForm.tsx`
- Create: `src/app/surveys/[id]/edit/_components/OptionsEditor.tsx`
- Create: `src/app/surveys/[id]/edit/_components/RatingConfig.tsx`
- Create: `src/app/surveys/[id]/edit/_components/MaxLengthConfig.tsx`
- Create: `src/app/surveys/[id]/edit/_components/QuestionCard.tsx`
- Create: `src/app/surveys/[id]/edit/_components/QuestionCardList.tsx`
- Create: `src/app/surveys/[id]/edit/_components/AddQuestionButton.tsx`
- Create: `src/app/surveys/[id]/edit/_components/PreviewPane.tsx`
- Modify: `src/app/surveys/[id]/edit/_components/SurveyBuilderClient.tsx` — wire all components together

---
### Task 8: Create the SurveyMetadataForm component

**Files:**
- Create: `src/app/surveys/[id]/edit/_components/SurveyMetadataForm.tsx`

- [ ] **Step 1: Create the metadata form with all fields**

Create `src/app/surveys/[id]/edit/_components/SurveyMetadataForm.tsx`:

```tsx
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

      {/* Slug */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          URL Slug
        </label>
        <div className="mt-1 flex items-center rounded-lg border border-gray-300 shadow-sm">
          <span className="px-3 text-sm text-gray-500">/s/</span>
          <input
            type="text"
            value={survey.slug}
            onChange={(e) => onUpdateField("slug", e.target.value)}
            className="block w-full rounded-r-lg border-0 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="my-survey-slug"
          />
        </div>
      </div>

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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/surveys/\[id\]/edit/_components/SurveyMetadataForm.tsx
git commit -m "feat: add SurveyMetadataForm with all fields and premium gating"
```

---

### Task 9: Create type-specific editor sub-components

**Files:**
- Create: `src/app/surveys/[id]/edit/_components/OptionsEditor.tsx`
- Create: `src/app/surveys/[id]/edit/_components/RatingConfig.tsx`
- Create: `src/app/surveys/[id]/edit/_components/MaxLengthConfig.tsx`

- [ ] **Step 1: Create OptionsEditor for Single Select and Multiple Choice**

Create `src/app/surveys/[id]/edit/_components/OptionsEditor.tsx`:

```tsx
"use client";

import { useCallback } from "react";

interface OptionsEditorProps {
  options: string[];
  onChange: (options: string[]) => void;
  errors: string[];
}

export function OptionsEditor({ options, onChange, errors }: OptionsEditorProps) {
  const handleOptionChange = useCallback(
    (index: number, value: string) => {
      const updated = [...options];
      updated[index] = value;
      onChange(updated);
    },
    [options, onChange],
  );

  const handleAddOption = useCallback(() => {
    onChange([...options, ""]);
  }, [options, onChange]);

  const handleRemoveOption = useCallback(
    (index: number) => {
      if (options.length <= 2) return; // Enforce minimum 2 options
      const updated = options.filter((_, i) => i !== index);
      onChange(updated);
    },
    [options, onChange],
  );

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-500">Options</label>
      {options.map((option, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="w-5 text-center text-xs text-gray-400">
            {index + 1}.
          </span>
          <input
            type="text"
            value={option}
            onChange={(e) => handleOptionChange(index, e.target.value)}
            placeholder={`Option ${index + 1}`}
            className="block flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => handleRemoveOption(index)}
            disabled={options.length <= 2}
            className="text-gray-400 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
            title="Remove option"
          >
            x
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={handleAddOption}
        className="text-sm text-blue-600 hover:text-blue-700"
      >
        + Add option
      </button>
      {errors.map((err) => (
        <p key={err} className="text-xs text-red-600">{err}</p>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create RatingConfig for Rating questions**

Create `src/app/surveys/[id]/edit/_components/RatingConfig.tsx`:

```tsx
"use client";

interface RatingConfigProps {
  minRating: number | null;
  maxRating: number | null;
  onChangeMin: (value: number) => void;
  onChangeMax: (value: number) => void;
  errors: string[];
}

export function RatingConfig({
  minRating,
  maxRating,
  onChangeMin,
  onChangeMax,
  errors,
}: RatingConfigProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-500">
        Rating Range
      </label>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">Min:</label>
          <input
            type="number"
            value={minRating ?? 1}
            onChange={(e) => onChangeMin(parseInt(e.target.value, 10) || 1)}
            className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <span className="text-gray-400">to</span>
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">Max:</label>
          <input
            type="number"
            value={maxRating ?? 5}
            onChange={(e) => onChangeMax(parseInt(e.target.value, 10) || 5)}
            className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      {errors.map((err) => (
        <p key={err} className="text-xs text-red-600">{err}</p>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create MaxLengthConfig for Free Text questions**

Create `src/app/surveys/[id]/edit/_components/MaxLengthConfig.tsx`:

```tsx
"use client";

interface MaxLengthConfigProps {
  maxLength: number | null;
  onChange: (value: number) => void;
  errors: string[];
}

export function MaxLengthConfig({
  maxLength,
  onChange,
  errors,
}: MaxLengthConfigProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-500">
        Max Character Length
      </label>
      <input
        type="number"
        value={maxLength ?? 500}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 500)}
        min={1}
        className="w-32 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {errors.map((err) => (
        <p key={err} className="text-xs text-red-600">{err}</p>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/surveys/\[id\]/edit/_components/OptionsEditor.tsx src/app/surveys/\[id\]/edit/_components/RatingConfig.tsx src/app/surveys/\[id\]/edit/_components/MaxLengthConfig.tsx
git commit -m "feat: add OptionsEditor, RatingConfig, and MaxLengthConfig sub-components"
```

---

### Task 10: Create the QuestionCard component

**Files:**
- Create: `src/app/surveys/[id]/edit/_components/QuestionCard.tsx`

- [ ] **Step 1: Create QuestionCard with type badge, controls, and type-specific sub-forms**

Create `src/app/surveys/[id]/edit/_components/QuestionCard.tsx`:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/surveys/\[id\]/edit/_components/QuestionCard.tsx
git commit -m "feat: add QuestionCard with type badge, controls, and type-specific editors"
```

---

### Task 11: Create the QuestionCardList component

**Files:**
- Create: `src/app/surveys/[id]/edit/_components/QuestionCardList.tsx`

- [ ] **Step 1: Create QuestionCardList rendering all question cards**

Create `src/app/surveys/[id]/edit/_components/QuestionCardList.tsx`:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/surveys/\[id\]/edit/_components/QuestionCardList.tsx
git commit -m "feat: add QuestionCardList component"
```

---

### Task 12: Create the AddQuestionButton with TypePickerMenu

**Files:**
- Create: `src/app/surveys/[id]/edit/_components/AddQuestionButton.tsx`

- [ ] **Step 1: Create AddQuestionButton with type selection menu**

Create `src/app/surveys/[id]/edit/_components/AddQuestionButton.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import type { QuestionDraft } from "../_lib/validation";

const QUESTION_TYPES: {
  value: QuestionDraft["questionType"];
  label: string;
  description: string;
}[] = [
  {
    value: "SINGLE_SELECT",
    label: "Single Select",
    description: "Respondents pick one option",
  },
  {
    value: "MULTIPLE_CHOICE",
    label: "Multiple Choice",
    description: "Respondents select multiple options",
  },
  {
    value: "RATING",
    label: "Rating",
    description: "Respondents rate on a numeric scale",
  },
  {
    value: "FREE_TEXT",
    label: "Free Text",
    description: "Respondents write an open-ended answer",
  },
];

interface AddQuestionButtonProps {
  onAddQuestion: (type: QuestionDraft["questionType"]) => void;
}

export function AddQuestionButton({ onAddQuestion }: AddQuestionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (type: QuestionDraft["questionType"]) => {
    onAddQuestion(type);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600"
      >
        + Add Question
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 z-10 mt-2 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {QUESTION_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => handleSelect(type.value)}
              className="flex w-full flex-col px-4 py-2.5 text-left hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-900">
                {type.label}
              </span>
              <span className="text-xs text-gray-500">{type.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/surveys/\[id\]/edit/_components/AddQuestionButton.tsx
git commit -m "feat: add AddQuestionButton with TypePickerMenu"
```

---

### Task 13: Create the PreviewPane component

**Files:**
- Create: `src/app/surveys/[id]/edit/_components/PreviewPane.tsx`

- [ ] **Step 1: Create PreviewPane with read-only live preview of all question types**

Create `src/app/surveys/[id]/edit/_components/PreviewPane.tsx`:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/surveys/\[id\]/edit/_components/PreviewPane.tsx
git commit -m "feat: add PreviewPane with live preview for all 4 question types"
```

---

### Task 14: Wire up SurveyBuilderClient and verify build

- [ ] **Step 1: Verify that the SurveyBuilderClient imports resolve correctly**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`

If there are type errors related to the tRPC router outputs (because `survey.getForEdit` doesn't exist yet from earlier plans), add a temporary type assertion or stub the type. The component structure should compile once the tRPC routers from plans 2a/2b are in place.

- [ ] **Step 2: Verify the build compiles with no errors (may require stubs if prior plans not yet merged)**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm build`

Fix any compilation errors. If errors are caused by missing tRPC routers (from plans 2a/2b), note them and move on — they will resolve once dependencies are merged.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues in survey builder components"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `src/app/surveys/[id]/edit/page.tsx` exists with auth gate and creator-only check
- [ ] `SurveyBuilderClient` renders split-pane layout with editor left, preview right
- [ ] `SurveyMetadataForm` has all 8 fields: title, description, slug, isPrivate, accessMode, resultsVisibility, categories, tags
- [ ] Premium gating is visible on isPrivate, accessMode, and resultsVisibility fields
- [ ] `QuestionCard` renders all 4 question types with type-specific sub-forms
- [ ] `QuestionCard` has up/down/duplicate/delete controls with correct enable/disable logic
- [ ] `AddQuestionButton` shows type picker menu with 4 options
- [ ] `PreviewPane` renders all 4 question types in read-only mode
- [ ] Rating preview uses numbered buttons for ranges <=10, number input for >10
- [ ] `useAutoSave` debounces at 1.5s and shows saving/saved/error status
- [ ] `BuilderHeader` shows save status and publish button
- [ ] `PublishDialog` shows confirmation with immutability warning
- [ ] Validation catches all 13 rules from the spec
- [ ] Mobile: split-pane collapses to tabbed editor/preview toggle
- [ ] `BuilderFooter` shows question count and DRAFT status
- [ ] `pnpm typecheck` passes (or only fails on missing tRPC router types from earlier plans)
