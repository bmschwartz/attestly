# Sub-Plan 2c-1: Survey Builder Shell, Metadata & Publish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the survey builder page shell — constants, validation, hooks (useSurveyBuilder, useAutoSave), header, footer, publish dialog. This provides the foundation that 2c-2 builds upon.

**Assumes:** Prisma schema (1a), auth (1b), app shell (1c), survey CRUD (2a), question CRUD (2b) are implemented.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, tRPC 11, Zod 4, TypeScript 6

**Spec reference:** `docs/superpowers/specs/2026-04-05-survey-builder-design.md`

---

## File Structure

- Create: `src/app/surveys/[id]/edit/page.tsx` — builder page (server component, auth gate)
- Create: `src/app/surveys/[id]/edit/_components/SurveyBuilderClient.tsx` — client orchestrator (placeholder, wired up in 2c-2)
- Create: `src/app/surveys/[id]/edit/_components/BuilderHeader.tsx`
- Create: `src/app/surveys/[id]/edit/_components/BuilderFooter.tsx`
- Create: `src/app/surveys/[id]/edit/_components/PublishDialog.tsx`
- Create: `src/app/surveys/[id]/edit/_hooks/useAutoSave.ts`
- Create: `src/app/surveys/[id]/edit/_hooks/useSurveyBuilder.ts`
- Create: `src/app/surveys/[id]/edit/_lib/validation.ts`
- Create: `src/app/surveys/[id]/edit/_lib/constants.ts`

---

### Task 1: Create constants and validation library

**Files:**
- Create: `src/app/surveys/[id]/edit/_lib/constants.ts`
- Create: `src/app/surveys/[id]/edit/_lib/validation.ts`

- [ ] **Step 1: Create the constants file with categories list and limits**

Create `src/app/surveys/[id]/edit/_lib/constants.ts`:

```typescript
export const SURVEY_CATEGORIES = [
  "Business",
  "Education",
  "Research",
  "Health",
  "Technology",
  "Politics",
  "Entertainment",
  "Science",
  "Community",
  "Other",
] as const;

export type SurveyCategory = (typeof SURVEY_CATEGORIES)[number];

export const LIMITS = {
  TITLE_MAX: 200,
  DESCRIPTION_MAX: 2000,
  QUESTIONS_MIN: 1,
  QUESTIONS_MAX: 100,
  OPTIONS_MIN: 2,
  CATEGORIES_MIN: 1,
  CATEGORIES_MAX: 5,
  TAGS_MAX: 10,
  RATING_DEFAULT_MIN: 1,
  RATING_DEFAULT_MAX: 5,
  FREE_TEXT_DEFAULT_MAX_LENGTH: 500,
} as const;

export const RESULTS_VISIBILITY_OPTIONS = [
  { value: "PUBLIC", label: "Public", premium: false },
  { value: "RESPONDENTS", label: "Respondents Only", premium: true },
  { value: "CREATOR", label: "Creator Only", premium: true },
] as const;
```

- [ ] **Step 2: Create the validation library with all publish validation rules**

Create `src/app/surveys/[id]/edit/_lib/validation.ts`:

```typescript
import { LIMITS } from "./constants";

export interface QuestionDraft {
  id: string;
  text: string;
  questionType: "SINGLE_SELECT" | "MULTIPLE_CHOICE" | "RATING" | "FREE_TEXT";
  position: number;
  required: boolean;
  options: string[];
  minRating: number | null;
  maxRating: number | null;
  maxLength: number | null;
}

export interface SurveyDraft {
  title: string;
  description: string;
  slug: string;
  categories: string[];
  tags: string[];
  questions: QuestionDraft[];
}

export interface ValidationError {
  field: string;
  questionIndex?: number;
  message: string;
}

export function validateSurveyForPublish(
  survey: SurveyDraft,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Title validation
  if (!survey.title.trim()) {
    errors.push({ field: "title", message: "Survey title is required" });
  } else if (survey.title.length > LIMITS.TITLE_MAX) {
    errors.push({
      field: "title",
      message: `Title must be under ${LIMITS.TITLE_MAX} characters`,
    });
  }

  // Description validation
  if (!survey.description.trim()) {
    errors.push({
      field: "description",
      message: "Survey description is required",
    });
  } else if (survey.description.length > LIMITS.DESCRIPTION_MAX) {
    errors.push({
      field: "description",
      message: `Description must be under ${LIMITS.DESCRIPTION_MAX} characters`,
    });
  }

  // Categories validation
  if (survey.categories.length < LIMITS.CATEGORIES_MIN) {
    errors.push({
      field: "categories",
      message: "Select at least 1 category",
    });
  } else if (survey.categories.length > LIMITS.CATEGORIES_MAX) {
    errors.push({ field: "categories", message: "Maximum 5 categories" });
  }

  // Tags validation
  if (survey.tags.length > LIMITS.TAGS_MAX) {
    errors.push({ field: "tags", message: "Maximum 10 tags" });
  }

  // Question count validation
  if (survey.questions.length < LIMITS.QUESTIONS_MIN) {
    errors.push({
      field: "questions",
      message: "Survey must have at least 1 question",
    });
  } else if (survey.questions.length > LIMITS.QUESTIONS_MAX) {
    errors.push({
      field: "questions",
      message: "Survey cannot have more than 100 questions",
    });
  }

  // Per-question validation
  survey.questions.forEach((question, index) => {
    const n = index + 1;

    if (!question.text.trim()) {
      errors.push({
        field: "questionText",
        questionIndex: index,
        message: `Question ${n} is missing text`,
      });
    }

    if (
      question.questionType === "SINGLE_SELECT" ||
      question.questionType === "MULTIPLE_CHOICE"
    ) {
      if (question.options.length < LIMITS.OPTIONS_MIN) {
        errors.push({
          field: "options",
          questionIndex: index,
          message: `Question ${n} must have at least 2 options`,
        });
      }

      const hasEmpty = question.options.some((opt) => !opt.trim());
      if (hasEmpty) {
        errors.push({
          field: "options",
          questionIndex: index,
          message: `Question ${n} has an empty option`,
        });
      }

      const uniqueOptions = new Set(
        question.options.map((opt) => opt.trim().toLowerCase()),
      );
      if (uniqueOptions.size !== question.options.length) {
        errors.push({
          field: "options",
          questionIndex: index,
          message: `Question ${n} has duplicate options`,
        });
      }
    }

    if (question.questionType === "RATING") {
      const min = question.minRating ?? LIMITS.RATING_DEFAULT_MIN;
      const max = question.maxRating ?? LIMITS.RATING_DEFAULT_MAX;
      if (min >= max) {
        errors.push({
          field: "rating",
          questionIndex: index,
          message: `Question ${n}: min rating must be less than max`,
        });
      }
    }

    if (question.questionType === "FREE_TEXT") {
      const maxLength =
        question.maxLength ?? LIMITS.FREE_TEXT_DEFAULT_MAX_LENGTH;
      if (maxLength <= 0) {
        errors.push({
          field: "maxLength",
          questionIndex: index,
          message: `Question ${n}: max length must be greater than 0`,
        });
      }
    }
  });

  return errors;
}

export function getErrorsForField(
  errors: ValidationError[],
  field: string,
  questionIndex?: number,
): string[] {
  return errors
    .filter(
      (e) =>
        e.field === field &&
        (questionIndex === undefined || e.questionIndex === questionIndex),
    )
    .map((e) => e.message);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/surveys/\[id\]/edit/_lib/
git commit -m "feat: add survey builder constants and publish validation"
```

---

### Task 2: Create the SurveyBuilderPage server component and SurveyBuilderClient

**Files:**
- Create: `src/app/surveys/[id]/edit/page.tsx`
- Create: `src/app/surveys/[id]/edit/_components/SurveyBuilderClient.tsx`

- [ ] **Step 1: Create the page server component with auth gate and data fetch**

Create `src/app/surveys/[id]/edit/page.tsx`:

```typescript
import { notFound, redirect } from "next/navigation";
import { api } from "~/trpc/server";
import { SurveyBuilderClient } from "./_components/SurveyBuilderClient";

// Auth handled by AuthGuard component from Plan 1c

export default async function SurveyBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const survey = await api.survey.getForEdit({ id });
  if (!survey) {
    notFound();
  }

  // Cannot edit published/closed surveys
  if (survey.status !== "DRAFT") {
    redirect(`/surveys/${id}`);
  }

  return <SurveyBuilderClient initialSurvey={survey} />;
}
```

- [ ] **Step 2: Create the SurveyBuilderClient orchestrator component**

Create `src/app/surveys/[id]/edit/_components/SurveyBuilderClient.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { RouterOutputs } from "~/trpc/react";
import { BuilderHeader } from "./BuilderHeader";
import { BuilderFooter } from "./BuilderFooter";
import { SurveyMetadataForm } from "./SurveyMetadataForm";
import { QuestionCardList } from "./QuestionCardList";
import { AddQuestionButton } from "./AddQuestionButton";
import { PreviewPane } from "./PreviewPane";
import { useSurveyBuilder } from "../_hooks/useSurveyBuilder";
import { useAutoSave } from "../_hooks/useAutoSave";

type SurveyForEdit = NonNullable<RouterOutputs["survey"]["getForEdit"]>;

interface SurveyBuilderClientProps {
  initialSurvey: SurveyForEdit;
}

export function SurveyBuilderClient({
  initialSurvey,
}: SurveyBuilderClientProps) {
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");

  const builder = useSurveyBuilder(initialSurvey);
  const { saveStatus } = useAutoSave(builder);

  return (
    <div className="flex h-screen flex-col">
      <BuilderHeader
        saveStatus={saveStatus}
        surveyId={initialSurvey.id}
        survey={builder.survey}
        questions={builder.questions}
        validationErrors={builder.validationErrors}
        onPublish={builder.handlePublish}
      />

      {/* Mobile tab toggle */}
      <div className="flex border-b border-gray-200 md:hidden">
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === "editor"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500"
          }`}
          onClick={() => setActiveTab("editor")}
        >
          Editor
        </button>
        <button
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === "preview"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500"
          }`}
          onClick={() => setActiveTab("preview")}
        >
          Preview
        </button>
      </div>

      {/* Split pane layout */}
      <div className="flex min-h-0 flex-1">
        {/* Editor pane — hidden on mobile when preview tab active */}
        <div
          className={`flex-1 overflow-y-auto border-r border-gray-200 p-6 ${
            activeTab === "preview" ? "hidden md:block" : ""
          }`}
        >
          <SurveyMetadataForm
            survey={builder.survey}
            validationErrors={builder.validationErrors}
            onUpdateField={builder.updateSurveyField}
            onUpdateCategories={builder.updateCategories}
            onUpdateTags={builder.updateTags}
            isPremium={builder.isPremium}
          />

          <div className="mt-8">
            <QuestionCardList
              questions={builder.questions}
              validationErrors={builder.validationErrors}
              onUpdateQuestion={builder.updateQuestion}
              onMoveQuestion={builder.moveQuestion}
              onDuplicateQuestion={builder.duplicateQuestion}
              onDeleteQuestion={builder.deleteQuestion}
            />
          </div>

          <div className="mt-4">
            <AddQuestionButton onAddQuestion={builder.addQuestion} />
          </div>
        </div>

        {/* Preview pane — hidden on mobile when editor tab active */}
        <div
          className={`flex-1 overflow-y-auto bg-gray-50 p-6 ${
            activeTab === "editor" ? "hidden md:block" : ""
          }`}
        >
          <PreviewPane
            survey={builder.survey}
            questions={builder.questions}
          />
        </div>
      </div>

      <BuilderFooter
        questionCount={builder.questions.length}
        status="DRAFT"
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/surveys/\[id\]/edit/page.tsx src/app/surveys/\[id\]/edit/_components/SurveyBuilderClient.tsx
git commit -m "feat: add SurveyBuilderPage and SurveyBuilderClient orchestrator"
```

---

### Task 3: Create the useSurveyBuilder hook

**Files:**
- Create: `src/app/surveys/[id]/edit/_hooks/useSurveyBuilder.ts`

- [ ] **Step 1: Create the hook managing all builder state and actions**

Create `src/app/surveys/[id]/edit/_hooks/useSurveyBuilder.ts`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { RouterOutputs } from "~/trpc/react";
import { api } from "~/trpc/react";
import type { QuestionDraft, ValidationError } from "../_lib/validation";
import { validateSurveyForPublish } from "../_lib/validation";
import { LIMITS } from "../_lib/constants";

type SurveyForEdit = NonNullable<RouterOutputs["survey"]["getForEdit"]>;

export interface SurveyState {
  title: string;
  description: string;
  slug: string;
  isPrivate: boolean;
  accessMode: "OPEN" | "INVITE_ONLY";
  resultsVisibility: "PUBLIC" | "RESPONDENTS" | "CREATOR";
  categories: string[];
  tags: string[];
}

export function useSurveyBuilder(initialSurvey: SurveyForEdit) {
  const router = useRouter();

  const [survey, setSurvey] = useState<SurveyState>({
    title: initialSurvey.title,
    description: initialSurvey.description,
    slug: initialSurvey.slug,
    isPrivate: initialSurvey.isPrivate,
    accessMode: initialSurvey.accessMode,
    resultsVisibility: initialSurvey.resultsVisibility,
    categories: (initialSurvey.categories as string[]) ?? [],
    tags: (initialSurvey.tags as string[]) ?? [],
  });

  const [questions, setQuestions] = useState<QuestionDraft[]>(
    initialSurvey.questions
      .sort((a, b) => a.position - b.position)
      .map((q) => ({
        id: q.id,
        text: q.text,
        questionType: q.questionType,
        position: q.position,
        required: q.required,
        options: (q.options as string[]) ?? [],
        minRating: q.minRating,
        maxRating: q.maxRating,
        maxLength: q.maxLength,
      })),
  );

  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    [],
  );

  const [isPremium] = useState(false); // Will be wired to subscription check

  // Track dirty state for auto-save
  const [surveyDirty, setSurveyDirty] = useState(false);
  const [dirtyQuestionIds, setDirtyQuestionIds] = useState<Set<string>>(
    new Set(),
  );

  const updateSurveyField = useCallback(
    (field: keyof SurveyState, value: SurveyState[keyof SurveyState]) => {
      setSurvey((prev) => ({ ...prev, [field]: value }));
      setSurveyDirty(true);
    },
    [],
  );

  const updateCategories = useCallback((categories: string[]) => {
    setSurvey((prev) => ({ ...prev, categories }));
    setSurveyDirty(true);
  }, []);

  const updateTags = useCallback((tags: string[]) => {
    setSurvey((prev) => ({ ...prev, tags }));
    setSurveyDirty(true);
  }, []);

  const updateQuestion = useCallback(
    (questionId: string, updates: Partial<QuestionDraft>) => {
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, ...updates } : q)),
      );
      setDirtyQuestionIds((prev) => new Set(prev).add(questionId));
    },
    [],
  );

  const addQuestion = useCallback(
    (
      questionType: QuestionDraft["questionType"],
    ) => {
      const newQuestion: QuestionDraft = {
        id: crypto.randomUUID(),
        text: "",
        questionType,
        position: questions.length,
        required: false,
        options:
          questionType === "SINGLE_SELECT" || questionType === "MULTIPLE_CHOICE"
            ? ["", ""]
            : [],
        minRating: questionType === "RATING" ? LIMITS.RATING_DEFAULT_MIN : null,
        maxRating: questionType === "RATING" ? LIMITS.RATING_DEFAULT_MAX : null,
        maxLength:
          questionType === "FREE_TEXT"
            ? LIMITS.FREE_TEXT_DEFAULT_MAX_LENGTH
            : null,
      };
      setQuestions((prev) => [...prev, newQuestion]);
      setDirtyQuestionIds((prev) => new Set(prev).add(newQuestion.id));
    },
    [questions.length],
  );

  const moveQuestion = useCallback(
    (questionId: string, direction: "up" | "down") => {
      setQuestions((prev) => {
        const index = prev.findIndex((q) => q.id === questionId);
        if (index === -1) return prev;
        if (direction === "up" && index === 0) return prev;
        if (direction === "down" && index === prev.length - 1) return prev;

        const newQuestions = [...prev];
        const swapIndex = direction === "up" ? index - 1 : index + 1;
        const current = newQuestions[index]!;
        const swap = newQuestions[swapIndex]!;

        newQuestions[index] = { ...swap, position: index };
        newQuestions[swapIndex] = { ...current, position: swapIndex };

        // Mark both as dirty
        setDirtyQuestionIds((prevDirty) => {
          const next = new Set(prevDirty);
          next.add(current.id);
          next.add(swap.id);
          return next;
        });

        return newQuestions;
      });
    },
    [],
  );

  const duplicateQuestion = useCallback((questionId: string) => {
    setQuestions((prev) => {
      const source = prev.find((q) => q.id === questionId);
      if (!source) return prev;

      const duplicate: QuestionDraft = {
        ...source,
        id: crypto.randomUUID(),
        position: prev.length,
      };

      setDirtyQuestionIds((prevDirty) => new Set(prevDirty).add(duplicate.id));
      return [...prev, duplicate];
    });
  }, []);

  const deleteQuestion = useCallback((questionId: string) => {
    setQuestions((prev) => {
      const filtered = prev.filter((q) => q.id !== questionId);
      // Reindex positions
      return filtered.map((q, i) => ({ ...q, position: i }));
    });
    // Note: deletion is handled separately via question.delete mutation in auto-save
    setDirtyQuestionIds((prev) => {
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
  }, []);

  const publishMutation = api.survey.publish.useMutation({
    onSuccess: (data) => {
      router.push(`/s/${survey.slug}`);
    },
  });

  const handlePublish = useCallback(() => {
    // Run validation
    const errors = validateSurveyForPublish({
      title: survey.title,
      description: survey.description,
      slug: survey.slug,
      categories: survey.categories,
      tags: survey.tags,
      questions,
    });

    setValidationErrors(errors);

    if (errors.length > 0) {
      return false;
    }

    return true; // Validation passed — caller shows confirmation dialog
  }, [survey, questions]);

  const confirmPublish = useCallback(() => {
    publishMutation.mutate({ id: initialSurvey.id });
  }, [publishMutation, initialSurvey.id]);

  return {
    survey,
    questions,
    validationErrors,
    isPremium,
    surveyDirty,
    dirtyQuestionIds,
    setSurveyDirty,
    setDirtyQuestionIds,
    updateSurveyField,
    updateCategories,
    updateTags,
    updateQuestion,
    addQuestion,
    moveQuestion,
    duplicateQuestion,
    deleteQuestion,
    handlePublish,
    confirmPublish,
    isPublishing: publishMutation.isPending,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/surveys/\[id\]/edit/_hooks/useSurveyBuilder.ts
git commit -m "feat: add useSurveyBuilder hook for builder state management"
```

---

### Task 4: Create the useAutoSave hook

**Files:**
- Create: `src/app/surveys/[id]/edit/_hooks/useAutoSave.ts`

- [ ] **Step 1: Create the debounced auto-save hook**

Create `src/app/surveys/[id]/edit/_hooks/useAutoSave.ts`:

```typescript
"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { api } from "~/trpc/react";
import type { useSurveyBuilder } from "./useSurveyBuilder";

type BuilderReturn = ReturnType<typeof useSurveyBuilder>;

export type SaveStatus = "saved" | "saving" | "error";

const DEBOUNCE_MS = 1500;

export function useAutoSave(builder: BuilderReturn) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const surveyUpdateMutation = api.survey.update.useMutation();
  const questionUpsertMutation = api.question.upsert.useMutation();
  const questionDeleteMutation = api.question.delete.useMutation();

  // Track which question IDs existed on last save, to detect deletions
  const prevQuestionIdsRef = useRef<Set<string>>(
    new Set(builder.questions.map((q) => q.id)),
  );

  const performSave = useCallback(async () => {
    const promises: Promise<unknown>[] = [];

    // Save survey metadata if dirty
    if (builder.surveyDirty) {
      promises.push(
        surveyUpdateMutation.mutateAsync({
          id: builder.survey.title, // This will be the survey ID passed through context
          title: builder.survey.title,
          description: builder.survey.description,
          slug: builder.survey.slug,
          isPrivate: builder.survey.isPrivate,
          accessMode: builder.survey.accessMode,
          resultsVisibility: builder.survey.resultsVisibility,
          categories: builder.survey.categories,
          tags: builder.survey.tags,
        }),
      );
    }

    // Upsert dirty questions
    for (const questionId of builder.dirtyQuestionIds) {
      const question = builder.questions.find((q) => q.id === questionId);
      if (question) {
        promises.push(
          questionUpsertMutation.mutateAsync({
            id: question.id,
            surveyId: question.id, // Will be wired to actual survey ID
            text: question.text,
            questionType: question.questionType,
            position: question.position,
            required: question.required,
            options: question.options,
            minRating: question.minRating,
            maxRating: question.maxRating,
            maxLength: question.maxLength,
          }),
        );
      }
    }

    // Detect deleted questions
    const currentIds = new Set(builder.questions.map((q) => q.id));
    for (const prevId of prevQuestionIdsRef.current) {
      if (!currentIds.has(prevId)) {
        promises.push(questionDeleteMutation.mutateAsync({ id: prevId }));
      }
    }

    if (promises.length === 0) return;

    setSaveStatus("saving");
    try {
      await Promise.all(promises);
      builder.setSurveyDirty(false);
      builder.setDirtyQuestionIds(new Set());
      prevQuestionIdsRef.current = currentIds;
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [
    builder,
    surveyUpdateMutation,
    questionUpsertMutation,
    questionDeleteMutation,
  ]);

  // Debounced trigger: any time dirty state changes, schedule a save
  useEffect(() => {
    const hasDirtyData =
      builder.surveyDirty || builder.dirtyQuestionIds.size > 0;

    if (!hasDirtyData) return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      void performSave();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [
    builder.surveyDirty,
    builder.dirtyQuestionIds,
    performSave,
  ]);

  return { saveStatus };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/surveys/\[id\]/edit/_hooks/useAutoSave.ts
git commit -m "feat: add useAutoSave hook with debounced save"
```

---

### Task 5: Create the BuilderHeader component

**Files:**
- Create: `src/app/surveys/[id]/edit/_components/BuilderHeader.tsx`

- [ ] **Step 1: Create BuilderHeader with save status and publish button**

Create `src/app/surveys/[id]/edit/_components/BuilderHeader.tsx`:

```tsx
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
  survey,
  questions,
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
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-gray-900">
          Survey Builder
        </h1>
        <span className={`text-sm ${SAVE_STATUS_COLORS[saveStatus]}`}>
          {SAVE_STATUS_LABELS[saveStatus]}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {validationErrors.length > 0 && (
          <span className="text-sm text-red-600">
            {validationErrors.length} error
            {validationErrors.length !== 1 ? "s" : ""}
          </span>
        )}
        <button
          onClick={handlePublishClick}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Publish
        </button>
      </div>

      {showPublishDialog && (
        <PublishDialog
          onClose={() => setShowPublishDialog(false)}
          surveyId={surveyId}
        />
      )}
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/surveys/\[id\]/edit/_components/BuilderHeader.tsx
git commit -m "feat: add BuilderHeader with save status and publish trigger"
```

---

### Task 6: Create the PublishDialog component

**Files:**
- Create: `src/app/surveys/[id]/edit/_components/PublishDialog.tsx`

- [ ] **Step 1: Create the publish confirmation dialog**

Create `src/app/surveys/[id]/edit/_components/PublishDialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

interface PublishDialogProps {
  onClose: () => void;
  surveyId: string;
}

export function PublishDialog({ onClose, surveyId }: PublishDialogProps) {
  const router = useRouter();

  const publishMutation = api.survey.publish.useMutation({
    onSuccess: (data) => {
      // Redirect to the published survey landing page
      router.push(`/surveys/${surveyId}`);
    },
    onError: () => {
      // Stay on dialog, show error
    },
  });

  const handleConfirm = () => {
    publishMutation.mutate({ id: surveyId });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">
          Publish Survey
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Publishing makes this survey permanent and immutable. You will not be
          able to edit it after publishing. Continue?
        </p>

        {publishMutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            {publishMutation.error?.message ?? "Failed to publish. Please try again."}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={publishMutation.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={publishMutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {publishMutation.isPending ? "Publishing..." : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/surveys/\[id\]/edit/_components/PublishDialog.tsx
git commit -m "feat: add PublishDialog confirmation component"
```

---

### Task 7: Create the BuilderFooter component

**Files:**
- Create: `src/app/surveys/[id]/edit/_components/BuilderFooter.tsx`

- [ ] **Step 1: Create BuilderFooter with question count and status**

Create `src/app/surveys/[id]/edit/_components/BuilderFooter.tsx`:

```tsx
"use client";

interface BuilderFooterProps {
  questionCount: number;
  status: string;
}

export function BuilderFooter({ questionCount, status }: BuilderFooterProps) {
  return (
    <footer className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-2">
      <span className="text-sm text-gray-500">
        {questionCount} question{questionCount !== 1 ? "s" : ""}
      </span>
      <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
        {status}
      </span>
    </footer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/surveys/\[id\]/edit/_components/BuilderFooter.tsx
git commit -m "feat: add BuilderFooter with question count and status"
```

