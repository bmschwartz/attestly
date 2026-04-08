# Question CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement tRPC router for question create/update, delete with reindexing, and reorder operations.

**Architecture:** Single question router with ownership validation helper. All mutations verify the survey is in DRAFT status and the authenticated user is the creator. Position management uses transactions for atomicity.

**Tech Stack:** tRPC 11, Prisma 7, Zod

**Spec reference:** `docs/superpowers/specs/2026-04-05-survey-builder-design.md`

---

### Task 1: Create question router with ownership helper

**Files:**
- Create: `src/server/api/routers/question.ts`

- [ ] **Step 1: Create the router file with the draft ownership helper**

```typescript
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { QuestionType } from "~/generated/prisma";

async function verifyDraftSurveyOwnership(
  db: Parameters<Parameters<typeof protectedProcedure.query>[0]>["ctx"]["db"],
  surveyId: string,
  userId: string,
) {
  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: { creatorId: true, status: true },
  });
  if (!survey) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
  }
  if (survey.creatorId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not your survey" });
  }
  if (survey.status !== "DRAFT") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Can only modify questions on draft surveys",
    });
  }
  return survey;
}

export const questionRouter = createTRPCRouter({
  // procedures added in subsequent tasks
});
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/question.ts
git commit -m "feat: create question router with draft ownership helper"
```

---

### Task 2: Implement question.upsert

**Files:**
- Modify: `src/server/api/routers/question.ts`

- [ ] **Step 1: Add the upsert procedure**

Add inside `createTRPCRouter({})`:

```typescript
  upsert: protectedProcedure
    .input(
      z.object({
        surveyId: z.string().uuid(),
        questionId: z.string().uuid().optional(),
        text: z.string().min(1),
        questionType: z.nativeEnum(QuestionType),
        position: z.number().int().min(0),
        required: z.boolean().default(false),
        options: z.array(z.string()).default([]),
        minRating: z.number().int().nullable().default(null),
        maxRating: z.number().int().nullable().default(null),
        maxLength: z.number().int().nullable().default(null),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyDraftSurveyOwnership(ctx.db, input.surveyId, ctx.userId);

      if (input.questionId) {
        // Update existing question
        const existing = await ctx.db.question.findUnique({
          where: { id: input.questionId },
          select: { surveyId: true },
        });
        if (!existing || existing.surveyId !== input.surveyId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Question not found in this survey",
          });
        }
        return ctx.db.question.update({
          where: { id: input.questionId },
          data: {
            text: input.text,
            questionType: input.questionType,
            position: input.position,
            required: input.required,
            options: input.options,
            minRating: input.minRating,
            maxRating: input.maxRating,
            maxLength: input.maxLength,
          },
        });
      } else {
        // Create new question
        return ctx.db.question.create({
          data: {
            surveyId: input.surveyId,
            text: input.text,
            questionType: input.questionType,
            position: input.position,
            required: input.required,
            options: input.options,
            minRating: input.minRating,
            maxRating: input.maxRating,
            maxLength: input.maxLength,
          },
        });
      }
    }),
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/question.ts
git commit -m "feat: add question.upsert procedure"
```

---

### Task 3: Implement question.delete with reindexing

**Files:**
- Modify: `src/server/api/routers/question.ts`

- [ ] **Step 1: Add the delete procedure**

```typescript
  delete: protectedProcedure
    .input(
      z.object({
        questionId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const question = await ctx.db.question.findUnique({
        where: { id: input.questionId },
        select: { surveyId: true, position: true },
      });
      if (!question) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Question not found",
        });
      }

      await verifyDraftSurveyOwnership(ctx.db, question.surveyId, ctx.userId);

      // Delete and reindex in a transaction
      await ctx.db.$transaction(async (tx) => {
        await tx.question.delete({ where: { id: input.questionId } });

        // Decrement position of all subsequent questions
        await tx.question.updateMany({
          where: {
            surveyId: question.surveyId,
            position: { gt: question.position },
          },
          data: {
            position: { decrement: 1 },
          },
        });
      });

      return { success: true };
    }),
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/question.ts
git commit -m "feat: add question.delete with position reindexing"
```

---

### Task 4: Implement question.reorder

**Files:**
- Modify: `src/server/api/routers/question.ts`

- [ ] **Step 1: Add the reorder procedure**

```typescript
  reorder: protectedProcedure
    .input(
      z.object({
        questionId: z.string().uuid(),
        direction: z.enum(["up", "down"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const question = await ctx.db.question.findUnique({
        where: { id: input.questionId },
        select: { id: true, surveyId: true, position: true },
      });
      if (!question) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Question not found",
        });
      }

      await verifyDraftSurveyOwnership(ctx.db, question.surveyId, ctx.userId);

      const targetPosition =
        input.direction === "up"
          ? question.position - 1
          : question.position + 1;

      // Find the adjacent question to swap with
      const adjacent = await ctx.db.question.findUnique({
        where: {
          surveyId_position: {
            surveyId: question.surveyId,
            position: targetPosition,
          },
        },
        select: { id: true, position: true },
      });

      if (!adjacent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot move ${input.direction} — already at the ${input.direction === "up" ? "top" : "bottom"}`,
        });
      }

      // Swap positions using a temporary position to avoid unique constraint violation
      const tempPosition = -1;
      await ctx.db.$transaction(async (tx) => {
        // Move current to temp
        await tx.question.update({
          where: { id: question.id },
          data: { position: tempPosition },
        });
        // Move adjacent to current's old position
        await tx.question.update({
          where: { id: adjacent.id },
          data: { position: question.position },
        });
        // Move current to adjacent's old position
        await tx.question.update({
          where: { id: question.id },
          data: { position: targetPosition },
        });
      });

      return { success: true };
    }),
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/question.ts
git commit -m "feat: add question.reorder with position swapping"
```

---

### Task 5: Register question router in root.ts

**Files:**
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Import and register the router**

Add to `src/server/api/root.ts`:

```typescript
import { questionRouter } from "~/server/api/routers/question";
```

Add to the `createTRPCRouter({})` call:

```typescript
question: questionRouter,
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/root.ts
git commit -m "feat: register question router"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `pnpm typecheck` — no TypeScript errors
- [ ] `pnpm lint` — no lint errors
- [ ] Question router exports: `upsert`, `delete`, `reorder`
- [ ] All mutations verify DRAFT status and creator ownership
- [ ] Delete reindexes positions of subsequent questions
- [ ] Reorder swaps positions atomically using a temp position to avoid unique constraint violations
- [ ] Router is registered in `root.ts`
