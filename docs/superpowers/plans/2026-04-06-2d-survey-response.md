# Survey Landing & Response Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the survey landing page and response form with auto-save, question rendering, and submission flow.

**Architecture:** Two pages — public landing page showing survey metadata with "Start Survey" CTA, and protected response form with auto-saving answer inputs. Response router handles start, save, submit, and clear operations.

**Tech Stack:** Next.js App Router, tRPC 11, Prisma 7, Tailwind CSS, Zod

**Spec reference:** `docs/superpowers/specs/2026-04-05-respondent-experience-design.md`

---

### Task 1: Create response router

**Files:**
- Create: `src/server/api/routers/response.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create the response router with all procedures**

```typescript
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const responseRouter = createTRPCRouter({
  start: protectedProcedure
    .input(z.object({ surveyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check survey exists and is published
      const survey = await ctx.db.survey.findUnique({
        where: { id: input.surveyId },
        select: { id: true, status: true, accessMode: true, creatorId: true },
      });
      if (!survey || survey.status !== "PUBLISHED") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found or not published" });
      }

      // Check for existing active response
      const existing = await ctx.db.response.findFirst({
        where: {
          surveyId: input.surveyId,
          respondentId: ctx.userId,
          deletedAt: null,
        },
      });
      if (existing) {
        return existing;
      }

      // Free tier response limit check
      const creator = await ctx.db.user.findUnique({
        where: { id: survey.creatorId },
        include: { subscription: true },
      });
      if (creator?.subscription?.plan === "FREE") {
        const responseCount = await ctx.db.response.count({
          where: {
            surveyId: input.surveyId,
            status: "SUBMITTED",
            deletedAt: null,
          },
        });
        if (responseCount >= 50) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This survey has reached its response limit",
          });
        }
      }

      // Create new IN_PROGRESS response
      return ctx.db.response.create({
        data: {
          surveyId: input.surveyId,
          respondentId: ctx.userId,
          status: "IN_PROGRESS",
        },
      });
    }),

  saveAnswer: protectedProcedure
    .input(
      z.object({
        responseId: z.string().uuid(),
        questionId: z.string().uuid(),
        questionIndex: z.number().int(),
        questionType: z.enum(["SINGLE_SELECT", "MULTIPLE_CHOICE", "RATING", "FREE_TEXT"]),
        value: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify response belongs to user and is IN_PROGRESS
      const response = await ctx.db.response.findUnique({
        where: { id: input.responseId },
        select: { respondentId: true, status: true },
      });
      if (!response || response.respondentId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Response not found" });
      }
      if (response.status !== "IN_PROGRESS") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Response already submitted" });
      }

      // Upsert answer
      return ctx.db.answer.upsert({
        where: {
          responseId_questionId: {
            responseId: input.responseId,
            questionId: input.questionId,
          },
        },
        update: { value: input.value },
        create: {
          responseId: input.responseId,
          questionId: input.questionId,
          questionIndex: input.questionIndex,
          questionType: input.questionType,
          value: input.value,
        },
      });
    }),

  submit: protectedProcedure
    .input(z.object({ responseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const response = await ctx.db.response.findUnique({
        where: { id: input.responseId },
        include: {
          survey: { include: { questions: true } },
          answers: true,
        },
      });
      if (!response || response.respondentId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Response not found" });
      }
      if (response.status !== "IN_PROGRESS") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Response already submitted" });
      }
      if (response.survey.status !== "PUBLISHED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Survey is no longer accepting responses" });
      }

      // Validate required questions are answered
      const requiredQuestionIds = response.survey.questions
        .filter((q) => q.required)
        .map((q) => q.id);
      const answeredQuestionIds = new Set(response.answers.map((a) => a.questionId));
      const unanswered = requiredQuestionIds.filter((id) => !answeredQuestionIds.has(id));
      if (unanswered.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Missing required answers for ${unanswered.length} question(s)`,
        });
      }

      return ctx.db.response.update({
        where: { id: input.responseId },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
        },
      });
    }),

  clear: protectedProcedure
    .input(z.object({ responseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const response = await ctx.db.response.findUnique({
        where: { id: input.responseId },
        select: { respondentId: true, status: true },
      });
      if (!response || response.respondentId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Response not found" });
      }
      if (response.status !== "IN_PROGRESS") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot clear a submitted response" });
      }

      // Delete all answers for this response
      await ctx.db.answer.deleteMany({
        where: { responseId: input.responseId },
      });

      return { success: true };
    }),
});
```

- [ ] **Step 2: Register in root.ts**

Add to `src/server/api/root.ts`:
```typescript
import { responseRouter } from "~/server/api/routers/response";
```
Add `response: responseRouter` to the router.

- [ ] **Step 3: Verify it compiles**

Run: `pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/response.ts src/server/api/root.ts
git commit -m "feat: add response router (start, saveAnswer, submit, clear)"
```

---

### Task 2: Create survey landing page

**Files:**
- Create: `src/app/s/[slug]/page.tsx`

- [ ] **Step 1: Create the landing page**

```typescript
import { api } from "~/trpc/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

export default async function SurveyLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const survey = await api.survey.getBySlug({ slug });

  if (!survey) {
    notFound();
  }

  const questionCount = survey._count?.questions ?? 0;
  const estimatedMinutes = Math.max(1, Math.ceil((questionCount * 30) / 60));

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold">{survey.title}</h1>
      <p className="mt-2 text-sm text-gray-500">
        by {survey.creator.displayName ?? survey.creator.walletAddress.slice(0, 10) + "..."}
      </p>

      <p className="mt-6 text-gray-700">{survey.description}</p>

      <p className="mt-4 text-sm text-gray-500">
        {questionCount} questions · ~{estimatedMinutes} min
      </p>

      {survey.status === "CLOSED" ? (
        <div className="mt-8 rounded-lg border border-gray-300 bg-gray-50 p-4 text-center">
          <p className="font-medium">This survey is closed</p>
          <Link
            href={`/s/${slug}/results`}
            className="mt-2 inline-block text-blue-600 hover:underline"
          >
            View results
          </Link>
        </div>
      ) : (
        <Link
          href={`/s/${slug}/respond`}
          className="mt-8 inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
        >
          Start Survey
        </Link>
      )}

      {survey.publishedAt && (
        <p className="mt-6 text-xs text-gray-400">
          Published {new Date(survey.publishedAt).toLocaleDateString()}
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/s/[slug]/page.tsx
git commit -m "feat: add survey landing page"
```

---

### Task 3: Create question input components

**Files:**
- Create: `src/app/_components/inputs/single-select-input.tsx`
- Create: `src/app/_components/inputs/multiple-choice-input.tsx`
- Create: `src/app/_components/inputs/rating-input.tsx`
- Create: `src/app/_components/inputs/free-text-input.tsx`

- [ ] **Step 1: Create SingleSelectInput**

```typescript
"use client";

interface SingleSelectInputProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function SingleSelectInput({ options, value, onChange, required }: SingleSelectInputProps) {
  return (
    <div className="space-y-2">
      {options.map((option) => (
        <label key={option} className="flex cursor-pointer items-center gap-3">
          <input
            type="radio"
            name={`single-select-${options[0]}`}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className="h-4 w-4 text-blue-600"
          />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create MultipleChoiceInput**

```typescript
"use client";

interface MultipleChoiceInputProps {
  options: string[];
  value: string; // JSON array string
  onChange: (value: string) => void;
  required?: boolean;
}

export function MultipleChoiceInput({ options, value, onChange }: MultipleChoiceInputProps) {
  const selected: string[] = value ? JSON.parse(value) : [];

  function toggleOption(option: string) {
    const updated = selected.includes(option)
      ? selected.filter((s) => s !== option)
      : [...selected, option].sort();
    onChange(JSON.stringify(updated));
  }

  return (
    <div className="space-y-2">
      {options.map((option) => (
        <label key={option} className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={selected.includes(option)}
            onChange={() => toggleOption(option)}
            className="h-4 w-4 rounded text-blue-600"
          />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create RatingInput**

```typescript
"use client";

interface RatingInputProps {
  minRating: number;
  maxRating: number;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function RatingInput({ minRating, maxRating, value, onChange }: RatingInputProps) {
  const range = maxRating - minRating + 1;

  if (range > 10) {
    return (
      <input
        type="number"
        min={minRating}
        max={maxRating}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded border px-3 py-2"
        placeholder={`${minRating}-${maxRating}`}
      />
    );
  }

  return (
    <div className="flex gap-2">
      {Array.from({ length: range }, (_, i) => minRating + i).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(String(n))}
          className={`h-10 w-10 rounded-lg border text-sm font-medium transition ${
            value === String(n)
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-gray-300 hover:border-blue-400"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create FreeTextInput**

```typescript
"use client";

interface FreeTextInputProps {
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function FreeTextInput({ maxLength, value, onChange }: FreeTextInputProps) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        className="w-full rounded border px-3 py-2"
        rows={4}
        placeholder="Type your answer..."
      />
      <p className="mt-1 text-right text-xs text-gray-400">
        {value.length} / {maxLength}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/inputs/
git commit -m "feat: add question input components (single select, multiple choice, rating, free text)"
```

---

### Task 4: Create response page with auto-save

**Files:**
- Create: `src/hooks/use-auto-save.ts`
- Create: `src/app/s/[slug]/respond/page.tsx` (server component wrapper)
- Create: `src/app/s/[slug]/respond/survey-respond-form.tsx` (client component)

- [ ] **Step 1: Create auto-save hook**

Create `src/hooks/use-auto-save.ts`:

```typescript
"use client";

import { useCallback, useRef, useState } from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useAutoSave(
  saveFn: (questionId: string, value: string) => Promise<void>,
  debounceMs = 1500,
) {
  const timers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pendingCount = useRef(0);
  const [status, setStatus] = useState<SaveStatus>("idle");

  const save = useCallback(
    (questionId: string, value: string) => {
      const existing = timers.current.get(questionId);
      if (existing) clearTimeout(existing);

      setStatus("saving");

      const timer = setTimeout(async () => {
        timers.current.delete(questionId);
        pendingCount.current += 1;
        try {
          await saveFn(questionId, value);
          pendingCount.current -= 1;
          if (pendingCount.current === 0) {
            setStatus("saved");
          }
        } catch {
          pendingCount.current -= 1;
          setStatus("error");
        }
      }, debounceMs);

      timers.current.set(questionId, timer);
    },
    [saveFn, debounceMs],
  );

  const flushAll = useCallback(async () => {
    // Clear all pending timers and trigger saves immediately
    const entries = Array.from(timers.current.entries());
    for (const [, timer] of entries) {
      clearTimeout(timer);
    }
    timers.current.clear();
  }, []);

  return { save, flushAll, status };
}
```

- [ ] **Step 2: Create the server component wrapper page**

Create `src/app/s/[slug]/respond/page.tsx`:

```typescript
import { api } from "~/trpc/server";
import { redirect, notFound } from "next/navigation";
import { SurveyRespondForm } from "./survey-respond-form";

export default async function SurveyRespondPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const survey = await api.survey.getBySlug({ slug });

  if (!survey || survey.status === "DRAFT") {
    notFound();
  }

  if (survey.status === "CLOSED") {
    redirect(`/s/${slug}`);
  }

  return (
    <SurveyRespondForm
      surveyId={survey.id}
      surveyTitle={survey.title}
      slug={slug}
      questions={survey.questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type as "SINGLE_SELECT" | "MULTIPLE_CHOICE" | "RATING" | "FREE_TEXT",
        required: q.required,
        index: q.index,
        options: q.options as string[] | null,
        minRating: q.minRating as number | null,
        maxRating: q.maxRating as number | null,
        maxLength: q.maxLength as number | null,
      }))}
    />
  );
}
```

- [ ] **Step 3: Create the SurveyRespondForm client component**

Create `src/app/s/[slug]/respond/survey-respond-form.tsx`:

```typescript
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "~/trpc/react";
import { useAutoSave } from "~/hooks/use-auto-save";
import { SingleSelectInput } from "~/app/_components/inputs/single-select-input";
import { MultipleChoiceInput } from "~/app/_components/inputs/multiple-choice-input";
import { RatingInput } from "~/app/_components/inputs/rating-input";
import { FreeTextInput } from "~/app/_components/inputs/free-text-input";
import { useRouter } from "next/navigation";

interface Question {
  id: string;
  text: string;
  type: "SINGLE_SELECT" | "MULTIPLE_CHOICE" | "RATING" | "FREE_TEXT";
  required: boolean;
  index: number;
  options: string[] | null;
  minRating: number | null;
  maxRating: number | null;
  maxLength: number | null;
}

interface SurveyRespondFormProps {
  surveyId: string;
  surveyTitle: string;
  slug: string;
  questions: Question[];
}

export function SurveyRespondForm({
  surveyId,
  surveyTitle,
  slug,
  questions,
}: SurveyRespondFormProps) {
  const router = useRouter();

  // --- Response lifecycle ---
  const [responseId, setResponseId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [unansweredRequired, setUnansweredRequired] = useState<Set<string>>(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const questionRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const startMutation = api.response.start.useMutation();
  const saveAnswerMutation = api.response.saveAnswer.useMutation();
  const submitMutation = api.response.submit.useMutation();
  const clearMutation = api.response.clear.useMutation();

  // --- Start or resume the response on mount ---
  useEffect(() => {
    startMutation.mutate(
      { surveyId },
      {
        onSuccess: (response) => {
          setResponseId(response.id);
          // If resuming, pre-populate answers from existing response
          if (response.answers && Array.isArray(response.answers)) {
            const existingAnswers = new Map<string, string>();
            for (const answer of response.answers as { questionId: string; value: string }[]) {
              existingAnswers.set(answer.questionId, answer.value);
            }
            setAnswers(existingAnswers);
          }
        },
        onError: (error) => {
          if (error.data?.code === "FORBIDDEN") {
            setStartError("This survey has reached its response limit.");
          } else {
            setStartError(error.message);
          }
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  // --- Auto-save wiring ---
  const handleSaveAnswer = useCallback(
    async (questionId: string, value: string) => {
      if (!responseId) return;
      const question = questions.find((q) => q.id === questionId);
      if (!question) return;
      await saveAnswerMutation.mutateAsync({
        responseId,
        questionId,
        questionIndex: question.index,
        questionType: question.type,
        value,
      });
    },
    [responseId, questions, saveAnswerMutation],
  );

  const { save: debouncedSave, status: saveStatus } = useAutoSave(handleSaveAnswer);

  // --- Answer change handler ---
  const handleAnswerChange = useCallback(
    (questionId: string, value: string) => {
      setAnswers((prev) => {
        const next = new Map(prev);
        next.set(questionId, value);
        return next;
      });
      // Clear unanswered highlight when the user provides an answer
      setUnansweredRequired((prev) => {
        if (!prev.has(questionId)) return prev;
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
      debouncedSave(questionId, value);
    },
    [debouncedSave],
  );

  // --- Submit flow ---
  const handleSubmitClick = () => {
    setSubmitError(null);
    // Validate required questions
    const missing = questions
      .filter((q) => q.required)
      .filter((q) => {
        const val = answers.get(q.id);
        return !val || val.trim() === "" || val === "[]";
      })
      .map((q) => q.id);

    if (missing.length > 0) {
      setUnansweredRequired(new Set(missing));
      // Scroll to first unanswered required question
      const firstMissing = missing[0]!;
      const el = questionRefs.current.get(firstMissing);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    setShowConfirmDialog(true);
  };

  const handleConfirmSubmit = () => {
    if (!responseId) return;
    setShowConfirmDialog(false);
    submitMutation.mutate(
      { responseId },
      {
        onSuccess: () => {
          router.push(`/s/${slug}/confirmation`);
        },
        onError: (error) => {
          setSubmitError(error.message);
        },
      },
    );
  };

  // --- Clear responses ---
  const handleClearResponses = () => {
    if (!responseId) return;
    if (!window.confirm("Clear all your responses? This cannot be undone.")) return;
    clearMutation.mutate(
      { responseId },
      {
        onSuccess: () => {
          setAnswers(new Map());
          setUnansweredRequired(new Set());
        },
      },
    );
  };

  // --- Progress ---
  const answeredCount = Array.from(answers.values()).filter(
    (v) => v && v.trim() !== "" && v !== "[]",
  ).length;
  const totalCount = questions.length;

  // --- Save status label ---
  const saveStatusLabel =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "saved"
        ? "All changes saved"
        : saveStatus === "error"
          ? "Save failed"
          : "";

  // --- Error states ---
  if (startError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">{surveyTitle}</h1>
        <p className="mt-6 text-red-600">{startError}</p>
      </main>
    );
  }

  if (!responseId) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-gray-500">Loading survey...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {/* --- Header --- */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white pb-4 pt-2">
        <div>
          <h1 className="text-xl font-bold">{surveyTitle}</h1>
          {saveStatusLabel && (
            <p
              className={`mt-1 text-xs ${
                saveStatus === "error" ? "text-red-500" : "text-gray-400"
              }`}
            >
              {saveStatusLabel}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSubmitClick}
          disabled={submitMutation.isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitMutation.isPending ? "Submitting..." : "Submit"}
        </button>
      </header>

      {submitError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      {/* --- Questions --- */}
      <div className="mt-6 space-y-8">
        {questions.map((question, idx) => (
          <div
            key={question.id}
            ref={(el) => {
              questionRefs.current.set(question.id, el);
            }}
            className={`rounded-lg border p-5 ${
              unansweredRequired.has(question.id)
                ? "border-red-400 bg-red-50"
                : "border-gray-200"
            }`}
          >
            <p className="font-medium">
              <span className="mr-2 text-gray-400">{idx + 1}.</span>
              {question.text}
              {question.required && <span className="ml-1 text-red-500">*</span>}
            </p>

            {unansweredRequired.has(question.id) && (
              <p className="mt-1 text-xs text-red-500">This question is required</p>
            )}

            <div className="mt-3">
              {question.type === "SINGLE_SELECT" && question.options && (
                <SingleSelectInput
                  options={question.options}
                  value={answers.get(question.id) ?? ""}
                  onChange={(val) => handleAnswerChange(question.id, val)}
                  required={question.required}
                />
              )}
              {question.type === "MULTIPLE_CHOICE" && question.options && (
                <MultipleChoiceInput
                  options={question.options}
                  value={answers.get(question.id) ?? ""}
                  onChange={(val) => handleAnswerChange(question.id, val)}
                  required={question.required}
                />
              )}
              {question.type === "RATING" && (
                <RatingInput
                  minRating={question.minRating ?? 1}
                  maxRating={question.maxRating ?? 5}
                  value={answers.get(question.id) ?? ""}
                  onChange={(val) => handleAnswerChange(question.id, val)}
                  required={question.required}
                />
              )}
              {question.type === "FREE_TEXT" && (
                <FreeTextInput
                  maxLength={question.maxLength ?? 2000}
                  value={answers.get(question.id) ?? ""}
                  onChange={(val) => handleAnswerChange(question.id, val)}
                  required={question.required}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* --- Footer --- */}
      <footer className="mt-8 flex items-center justify-between border-t pt-4">
        <p className="text-sm text-gray-500">
          {answeredCount} of {totalCount} answered
        </p>
        <button
          type="button"
          onClick={handleClearResponses}
          disabled={clearMutation.isPending}
          className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
        >
          {clearMutation.isPending ? "Clearing..." : "Clear responses"}
        </button>
      </footer>

      {/* --- Confirmation Dialog --- */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-bold">Submit your response?</h2>
            <p className="mt-2 text-sm text-gray-600">
              This cannot be changed after submission.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmDialog(false)}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Confirm &amp; Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-auto-save.ts src/app/s/[slug]/respond/page.tsx src/app/s/[slug]/respond/survey-respond-form.tsx
git commit -m "feat: add response page with auto-save, question rendering, and answer management"
```

---

### Task 5: Add submit validation, edge-case handling, and confirmation dialog polish

**Files:**
- Modify: `src/app/s/[slug]/respond/survey-respond-form.tsx`

- [ ] **Step 1: Add survey-closed polling**

Add a `useEffect` that polls the survey status every 30 seconds. If the survey transitions to `CLOSED` while the respondent is filling out the form, show a blocking overlay.

Inside `SurveyRespondForm`, after the existing state declarations, add:

```typescript
const [surveyClosed, setSurveyClosed] = useState(false);

// Poll survey status to detect mid-response close
useEffect(() => {
  const interval = setInterval(async () => {
    try {
      const survey = await utils.survey.getBySlug.fetch({ slug });
      if (survey?.status === "CLOSED") {
        setSurveyClosed(true);
        clearInterval(interval);
      }
    } catch {
      // Ignore polling errors silently
    }
  }, 30_000);
  return () => clearInterval(interval);
}, [slug, utils]);
```

Then render the closed overlay above the header in the JSX:

```typescript
{surveyClosed && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 text-center shadow-lg">
      <h2 className="text-lg font-bold">This survey has closed</h2>
      <p className="mt-2 text-sm text-gray-600">
        The survey creator closed this survey while you were responding.
        Your in-progress answers were not submitted.
      </p>
      <a
        href={`/s/${slug}`}
        className="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Back to survey
      </a>
    </div>
  </div>
)}
```

- [ ] **Step 2: Handle response-limit-reached error**

Already handled in Step 3 of Task 4 — the `startMutation.onError` callback checks for `error.data?.code === "FORBIDDEN"` and sets `startError` to `"This survey has reached its response limit."`. Verify this renders correctly by inspecting the early-return error state.

- [ ] **Step 3: Handle invite-only access denied**

Extend the `startMutation.onError` callback to also catch `NOT_FOUND` errors indicating the respondent lacks access. The server-side `response.start` procedure already validates survey existence and status. For invite-only surveys, add a client-side pre-check:

After the `startMutation` setup in the mount `useEffect`, add a pre-check:

```typescript
useEffect(() => {
  async function initResponse() {
    // For invite-only surveys, check access first
    try {
      // response.start handles access validation server-side
      // If the user is not invited, it will throw NOT_FOUND or FORBIDDEN
      const response = await startMutation.mutateAsync({ surveyId });
      setResponseId(response.id);
      if (response.answers && Array.isArray(response.answers)) {
        const existingAnswers = new Map<string, string>();
        for (const answer of response.answers as { questionId: string; value: string }[]) {
          existingAnswers.set(answer.questionId, answer.value);
        }
        setAnswers(existingAnswers);
      }
    } catch (error: unknown) {
      const trpcError = error as { data?: { code?: string }; message?: string };
      if (trpcError.data?.code === "FORBIDDEN") {
        setStartError("This survey has reached its response limit.");
      } else if (trpcError.data?.code === "NOT_FOUND") {
        setStartError("You are not invited to this survey.");
      } else {
        setStartError(trpcError.message ?? "Something went wrong.");
      }
    }
  }
  void initResponse();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [surveyId]);
```

This replaces the original `startMutation.mutate` call in the mount `useEffect` with an async/await version that distinguishes error codes.

- [ ] **Step 4: Verify it compiles**

Run: `pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add src/app/s/[slug]/respond/survey-respond-form.tsx
git commit -m "feat: add survey-closed polling, invite-only check, and edge-case handling"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `pnpm typecheck` — no TypeScript errors
- [ ] `pnpm lint` — no lint errors
- [ ] Survey landing page renders at `/s/[slug]` with title, description, question count, "Start Survey" button
- [ ] Landing page shows "This survey is closed" for closed surveys
- [ ] Response page renders all 4 question types correctly
- [ ] Auto-save debounces and calls `response.saveAnswer` after 1.5s
- [ ] Submit validates required questions and shows confirmation dialog
- [ ] Submit redirects to confirmation page on success
- [ ] Response router: start, saveAnswer, submit, clear all work
- [ ] Free tier 50-response limit is enforced in `response.start`
