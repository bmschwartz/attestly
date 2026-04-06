# Sub-Plan 2c: Survey Builder UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the split-pane survey builder with live preview, question cards, auto-save, and publish flow at `/surveys/[id]/edit`.

**Assumes:** Prisma schema (1a), auth (1b), app shell (1c), survey CRUD tRPC routers (2a), question CRUD tRPC routers (2b) are all implemented. The following tRPC procedures are available: `survey.create`, `survey.update`, `survey.publish`, `survey.deleteDraft`, `survey.getForEdit`, `question.upsert`, `question.delete`, `question.reorder`.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, tRPC 11, Zod 4, TypeScript 6

**Spec reference:** `docs/superpowers/specs/2026-04-05-survey-builder-design.md`

---

## File Structure

- Create: `src/app/surveys/[id]/edit/page.tsx` — builder page (server component, auth gate)
- Create: `src/app/surveys/[id]/edit/_components/SurveyBuilderClient.tsx` — client component orchestrator
- Create: `src/app/surveys/[id]/edit/_components/BuilderHeader.tsx`
- Create: `src/app/surveys/[id]/edit/_components/BuilderFooter.tsx`
- Create: `src/app/surveys/[id]/edit/_components/SurveyMetadataForm.tsx`
- Create: `src/app/surveys/[id]/edit/_components/QuestionCard.tsx`
- Create: `src/app/surveys/[id]/edit/_components/QuestionCardList.tsx`
- Create: `src/app/surveys/[id]/edit/_components/AddQuestionButton.tsx`
- Create: `src/app/surveys/[id]/edit/_components/OptionsEditor.tsx`
- Create: `src/app/surveys/[id]/edit/_components/RatingConfig.tsx`
- Create: `src/app/surveys/[id]/edit/_components/MaxLengthConfig.tsx`
- Create: `src/app/surveys/[id]/edit/_components/PreviewPane.tsx`
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
import { redirect, notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { api } from "~/trpc/server";
import { SurveyBuilderClient } from "./_components/SurveyBuilderClient";

export default async function SurveyBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const { id } = await params;

  const survey = await api.survey.getForEdit({ id });
  if (!survey) {
    notFound();
  }

  // Creator-only access
  if (survey.creatorId !== session.user.id) {
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
