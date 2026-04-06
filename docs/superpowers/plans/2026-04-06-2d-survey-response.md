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
- Create: `src/app/s/[slug]/respond/page.tsx`
- Create: `src/hooks/use-auto-save.ts`

- [ ] **Step 1: Create auto-save hook**

```typescript
"use client";

import { useCallback, useRef } from "react";

export function useAutoSave(
  saveFn: (questionId: string, value: string) => Promise<void>,
  debounceMs = 1500,
) {
  const timers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const save = useCallback(
    (questionId: string, value: string) => {
      const existing = timers.current.get(questionId);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(async () => {
        timers.current.delete(questionId);
        await saveFn(questionId, value);
      }, debounceMs);

      timers.current.set(questionId, timer);
    },
    [saveFn, debounceMs],
  );

  return { save };
}
```

- [ ] **Step 2: Create the response page**

```typescript
"use client";

import { useState, useCallback } from "react";
import { api } from "~/trpc/react";
import { useAutoSave } from "~/hooks/use-auto-save";
import { SingleSelectInput } from "~/app/_components/inputs/single-select-input";
import { MultipleChoiceInput } from "~/app/_components/inputs/multiple-choice-input";
import { RatingInput } from "~/app/_components/inputs/rating-input";
import { FreeTextInput } from "~/app/_components/inputs/free-text-input";
import { useRouter } from "next/navigation";

// This is a client component wrapper — the parent server component
// handles auth and passes the survey + response data as props.
// For now, this page fetches client-side via tRPC.

export default function SurveyRespondPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Implementation: fetch survey, start/resume response, render questions,
  // auto-save answers, handle submit.
  // Full implementation follows the patterns from the input components above.
  // The page renders:
  // - ResponseHeader with save status and submit button
  // - QuestionList mapping over survey.questions
  // - ResponseFooter with "X of Y answered"

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <p>Response form — implementation in this task</p>
    </main>
  );
}
```

Note: The full response page implementation is substantial (150+ lines) and involves wiring up tRPC queries, state management for answers, the auto-save hook, submit validation, and question rendering. The implementer subagent should build this out fully following the patterns established in the input components and the spec's "Survey Response Page" section.

- [ ] **Step 3: Commit**

```bash
git add src/app/s/[slug]/respond/page.tsx src/hooks/use-auto-save.ts
git commit -m "feat: add response page with auto-save hook"
```

---

### Task 5: Implement submit flow and edge cases

**Files:**
- Modify: `src/app/s/[slug]/respond/page.tsx`

- [ ] **Step 1: Add submit validation and confirmation dialog**

The submit flow:
1. Client validates all required questions have answers
2. If validation fails, scroll to first unanswered required question and highlight it
3. If passes, show confirmation dialog: "Submit your response? This cannot be changed after submission."
4. On confirm, call `response.submit` mutation
5. On success, redirect to `/s/[slug]/confirmation`

- [ ] **Step 2: Handle edge cases**

Add handling for:
- Survey closed mid-response: poll survey status, show "This survey has closed" if status changes to CLOSED
- Response limit reached: handle the FORBIDDEN error from `response.start` gracefully
- Invite-only access denied: check `invite.check` before starting, show "You are not invited" if denied

- [ ] **Step 3: Commit**

```bash
git add src/app/s/[slug]/respond/page.tsx
git commit -m "feat: add submit flow and edge case handling"
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
