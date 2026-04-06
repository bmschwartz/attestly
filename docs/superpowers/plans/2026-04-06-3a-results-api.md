# Sub-Plan 3a: Results Aggregation API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement tRPC procedures for per-question result aggregation. Three endpoints: `results.getBySurvey` (access-gated by `resultsVisibility`), `results.getForCreator` (creator-only, works while PUBLISHED), and `results.getQuestionAggregation` (single-question lazy load with free text pagination).

**Architecture:** A dedicated `results` router with SQL-level aggregation via Prisma. Access control is enforced per procedure based on `resultsVisibility` (PUBLIC/RESPONDENTS/CREATOR). Aggregation logic is shared between `getBySurvey` and `getForCreator` via a helper function. Only SUBMITTED responses with `deletedAt IS NULL` are included.

**Tech Stack:** tRPC 11, Prisma 7, PostgreSQL, Zod 4

**Spec references:**
- `docs/superpowers/specs/2026-04-05-results-analytics-design.md` (results page, aggregation queries, access control)
- `docs/superpowers/specs/2026-04-04-data-model-design.md` (Answer, Response, Question, Survey models)

---

## File Structure

- Create: `src/server/api/routers/results.ts` — results router with all three procedures
- Modify: `src/server/api/root.ts` — register results router

---

### Task 1: Create aggregation helper functions

**Files:**
- Create: `src/server/api/routers/results.ts`

- [ ] **Step 1: Create the results router file with aggregation helpers**

Create `src/server/api/routers/results.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "../../../generated/prisma";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";

// ------------------------------------------------------------------
// Aggregation helpers
// ------------------------------------------------------------------

type SelectAggregation = {
  questionId: string;
  questionText: string;
  questionType: "SINGLE_SELECT" | "MULTIPLE_CHOICE";
  position: number;
  options: string[];
  totalResponses: number;
  optionCounts: { value: string; count: number; percentage: number }[];
};

type RatingAggregation = {
  questionId: string;
  questionText: string;
  questionType: "RATING";
  position: number;
  minRating: number;
  maxRating: number;
  totalResponses: number;
  average: number;
  distribution: { value: number; count: number; percentage: number }[];
};

type FreeTextAggregation = {
  questionId: string;
  questionText: string;
  questionType: "FREE_TEXT";
  position: number;
  totalResponses: number;
  responses: { value: string; submittedAt: Date }[];
  page: number;
  totalPages: number;
};

type QuestionAggregation = SelectAggregation | RatingAggregation | FreeTextAggregation;

async function aggregateSelectQuestion(
  db: PrismaClient,
  question: {
    id: string;
    text: string;
    questionType: "SINGLE_SELECT" | "MULTIPLE_CHOICE";
    position: number;
    options: unknown;
  },
  surveyId: string,
): Promise<SelectAggregation> {
  const options = question.options as string[];

  const answers = await db.answer.findMany({
    where: {
      questionId: question.id,
      response: {
        surveyId,
        status: "SUBMITTED",
        deletedAt: null,
      },
    },
    select: { value: true },
  });

  if (question.questionType === "SINGLE_SELECT") {
    const countMap = new Map<string, number>();
    for (const opt of options) {
      countMap.set(opt, 0);
    }
    for (const answer of answers) {
      const current = countMap.get(answer.value) ?? 0;
      countMap.set(answer.value, current + 1);
    }

    const totalResponses = answers.length;
    const optionCounts = options.map((opt) => {
      const count = countMap.get(opt) ?? 0;
      return {
        value: opt,
        count,
        percentage: totalResponses > 0 ? Math.round((count / totalResponses) * 1000) / 10 : 0,
      };
    });

    return {
      questionId: question.id,
      questionText: question.text,
      questionType: "SINGLE_SELECT",
      position: question.position,
      options,
      totalResponses,
      optionCounts,
    };
  }

  // MULTIPLE_CHOICE: each answer is a JSON array of selected options
  const countMap = new Map<string, number>();
  for (const opt of options) {
    countMap.set(opt, 0);
  }
  for (const answer of answers) {
    let selected: string[];
    try {
      selected = JSON.parse(answer.value) as string[];
    } catch {
      continue;
    }
    for (const sel of selected) {
      const current = countMap.get(sel) ?? 0;
      countMap.set(sel, current + 1);
    }
  }

  const totalResponses = answers.length;
  const optionCounts = options.map((opt) => {
    const count = countMap.get(opt) ?? 0;
    return {
      value: opt,
      count,
      percentage: totalResponses > 0 ? Math.round((count / totalResponses) * 1000) / 10 : 0,
    };
  });

  return {
    questionId: question.id,
    questionText: question.text,
    questionType: "MULTIPLE_CHOICE",
    position: question.position,
    options,
    totalResponses,
    optionCounts,
  };
}

async function aggregateRatingQuestion(
  db: PrismaClient,
  question: {
    id: string;
    text: string;
    position: number;
    minRating: number | null;
    maxRating: number | null;
  },
  surveyId: string,
): Promise<RatingAggregation> {
  const minRating = question.minRating ?? 1;
  const maxRating = question.maxRating ?? 5;

  const answers = await db.answer.findMany({
    where: {
      questionId: question.id,
      response: {
        surveyId,
        status: "SUBMITTED",
        deletedAt: null,
      },
    },
    select: { value: true },
  });

  const countMap = new Map<number, number>();
  for (let i = minRating; i <= maxRating; i++) {
    countMap.set(i, 0);
  }

  let sum = 0;
  let validCount = 0;
  for (const answer of answers) {
    const val = parseInt(answer.value, 10);
    if (!isNaN(val) && val >= minRating && val <= maxRating) {
      const current = countMap.get(val) ?? 0;
      countMap.set(val, current + 1);
      sum += val;
      validCount++;
    }
  }

  const average = validCount > 0 ? Math.round((sum / validCount) * 10) / 10 : 0;

  const distribution: { value: number; count: number; percentage: number }[] = [];
  for (let i = minRating; i <= maxRating; i++) {
    const count = countMap.get(i) ?? 0;
    distribution.push({
      value: i,
      count,
      percentage: validCount > 0 ? Math.round((count / validCount) * 1000) / 10 : 0,
    });
  }

  return {
    questionId: question.id,
    questionText: question.text,
    questionType: "RATING",
    position: question.position,
    minRating,
    maxRating,
    totalResponses: validCount,
    average,
    distribution,
  };
}

async function aggregateFreeTextQuestion(
  db: PrismaClient,
  question: {
    id: string;
    text: string;
    position: number;
  },
  surveyId: string,
  page: number,
  pageSize: number,
): Promise<FreeTextAggregation> {
  const totalResponses = await db.answer.count({
    where: {
      questionId: question.id,
      response: {
        surveyId,
        status: "SUBMITTED",
        deletedAt: null,
      },
    },
  });

  const totalPages = Math.max(1, Math.ceil(totalResponses / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);

  const answers = await db.answer.findMany({
    where: {
      questionId: question.id,
      response: {
        surveyId,
        status: "SUBMITTED",
        deletedAt: null,
      },
    },
    select: {
      value: true,
      response: {
        select: { submittedAt: true },
      },
    },
    orderBy: {
      response: { submittedAt: "desc" },
    },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });

  return {
    questionId: question.id,
    questionText: question.text,
    questionType: "FREE_TEXT",
    position: question.position,
    totalResponses,
    responses: answers.map((a) => ({
      value: a.value,
      submittedAt: a.response.submittedAt ?? new Date(),
    })),
    page: clampedPage,
    totalPages,
  };
}

async function aggregateAllQuestions(
  db: PrismaClient,
  surveyId: string,
  options: { hideFreeText?: boolean },
): Promise<QuestionAggregation[]> {
  const questions = await db.question.findMany({
    where: { surveyId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      text: true,
      questionType: true,
      position: true,
      options: true,
      minRating: true,
      maxRating: true,
    },
  });

  const results: QuestionAggregation[] = [];

  for (const q of questions) {
    if (q.questionType === "SINGLE_SELECT" || q.questionType === "MULTIPLE_CHOICE") {
      results.push(
        await aggregateSelectQuestion(
          db,
          { ...q, questionType: q.questionType },
          surveyId,
        ),
      );
    } else if (q.questionType === "RATING") {
      results.push(await aggregateRatingQuestion(db, q, surveyId));
    } else if (q.questionType === "FREE_TEXT") {
      if (options.hideFreeText) {
        // For private survey + PUBLIC results: show count only, no individual responses
        const totalResponses = await db.answer.count({
          where: {
            questionId: q.id,
            response: {
              surveyId,
              status: "SUBMITTED",
              deletedAt: null,
            },
          },
        });
        results.push({
          questionId: q.id,
          questionText: q.text,
          questionType: "FREE_TEXT",
          position: q.position,
          totalResponses,
          responses: [],
          page: 1,
          totalPages: 0,
        });
      } else {
        results.push(
          await aggregateFreeTextQuestion(db, q, surveyId, 1, 10),
        );
      }
    }
  }

  return results;
}

// Placeholder — router added in Task 2
export const resultsRouter = createTRPCRouter({});
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/results.ts
git commit -m "feat: add results aggregation helpers for all question types"
```

---

### Task 2: Implement `results.getBySurvey` procedure

**Files:**
- Modify: `src/server/api/routers/results.ts`

- [ ] **Step 1: Replace the placeholder router with `getBySurvey`**

Replace `export const resultsRouter = createTRPCRouter({});` at the bottom of the file with:

```typescript
export const resultsRouter = createTRPCRouter({
  getBySurvey: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { slug: input.slug },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          closedAt: true,
          isPrivate: true,
          resultsVisibility: true,
          creatorId: true,
        },
      });

      if (!survey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Survey not found",
        });
      }

      // Results only available when survey is CLOSED (for non-creators)
      if (survey.status !== "CLOSED") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Results are not yet available",
        });
      }

      // Access check by resultsVisibility
      const userId = ctx.session?.user?.id;

      if (survey.resultsVisibility === "CREATOR") {
        if (!userId || userId !== survey.creatorId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the survey creator can view these results",
          });
        }
      }

      if (survey.resultsVisibility === "RESPONDENTS") {
        if (!userId) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "You must be signed in to view these results",
          });
        }
        const hasSubmitted = await ctx.db.response.findFirst({
          where: {
            surveyId: survey.id,
            respondentId: userId,
            status: "SUBMITTED",
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!hasSubmitted) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only respondents who submitted a response can view these results",
          });
        }
      }

      // PUBLIC visibility: no auth check needed

      const responseCount = await ctx.db.response.count({
        where: {
          surveyId: survey.id,
          status: "SUBMITTED",
          deletedAt: null,
        },
      });

      // Private survey + PUBLIC results: hide free text individual responses
      const hideFreeText = survey.isPrivate && survey.resultsVisibility === "PUBLIC";

      const questions = await aggregateAllQuestions(ctx.db, survey.id, { hideFreeText });

      return {
        survey: {
          id: survey.id,
          title: survey.title,
          description: survey.description,
          status: survey.status,
          closedAt: survey.closedAt,
          resultsVisibility: survey.resultsVisibility,
        },
        responseCount,
        questions,
      };
    }),
});
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/results.ts
git commit -m "feat: add results.getBySurvey with access control by resultsVisibility"
```

---

### Task 3: Implement `results.getForCreator` procedure

**Files:**
- Modify: `src/server/api/routers/results.ts`

- [ ] **Step 1: Add `getForCreator` to the router**

Add this procedure inside the `createTRPCRouter({})` call, after `getBySurvey`:

```typescript
  getForCreator: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const survey = await ctx.db.survey.findUnique({
        where: { slug: input.slug },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          closedAt: true,
          publishedAt: true,
          isPrivate: true,
          resultsVisibility: true,
          creatorId: true,
        },
      });

      if (!survey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Survey not found",
        });
      }

      if (survey.creatorId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the survey creator can access this",
        });
      }

      // Creator can view results while PUBLISHED or CLOSED
      if (survey.status === "DRAFT") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Results are not available for draft surveys",
        });
      }

      const responseCount = await ctx.db.response.count({
        where: {
          surveyId: survey.id,
          status: "SUBMITTED",
          deletedAt: null,
        },
      });

      // Creator always sees full results, including free text
      const questions = await aggregateAllQuestions(ctx.db, survey.id, { hideFreeText: false });

      return {
        survey: {
          id: survey.id,
          title: survey.title,
          description: survey.description,
          status: survey.status,
          closedAt: survey.closedAt,
          publishedAt: survey.publishedAt,
          resultsVisibility: survey.resultsVisibility,
        },
        responseCount,
        questions,
      };
    }),
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/results.ts
git commit -m "feat: add results.getForCreator for real-time creator results"
```

---

### Task 4: Implement `results.getQuestionAggregation` procedure

**Files:**
- Modify: `src/server/api/routers/results.ts`

- [ ] **Step 1: Add `getQuestionAggregation` to the router**

Add this procedure inside the `createTRPCRouter({})` call, after `getForCreator`:

```typescript
  getQuestionAggregation: publicProcedure
    .input(
      z.object({
        slug: z.string(),
        questionId: z.string(),
        page: z.number().int().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { slug: input.slug },
        select: {
          id: true,
          status: true,
          isPrivate: true,
          resultsVisibility: true,
          creatorId: true,
        },
      });

      if (!survey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Survey not found",
        });
      }

      // Same access control as getBySurvey
      const userId = ctx.session?.user?.id;
      const isCreator = userId === survey.creatorId;

      if (!isCreator && survey.status !== "CLOSED") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Results are not yet available",
        });
      }

      if (survey.resultsVisibility === "CREATOR") {
        if (!userId || userId !== survey.creatorId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the survey creator can view these results",
          });
        }
      }

      if (survey.resultsVisibility === "RESPONDENTS") {
        if (!userId) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "You must be signed in to view these results",
          });
        }
        if (!isCreator) {
          const hasSubmitted = await ctx.db.response.findFirst({
            where: {
              surveyId: survey.id,
              respondentId: userId,
              status: "SUBMITTED",
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!hasSubmitted) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Only respondents who submitted a response can view these results",
            });
          }
        }
      }

      const question = await ctx.db.question.findFirst({
        where: {
          id: input.questionId,
          surveyId: survey.id,
        },
        select: {
          id: true,
          text: true,
          questionType: true,
          position: true,
          options: true,
          minRating: true,
          maxRating: true,
        },
      });

      if (!question) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Question not found",
        });
      }

      const hideFreeText =
        survey.isPrivate &&
        survey.resultsVisibility === "PUBLIC" &&
        !isCreator;

      if (question.questionType === "SINGLE_SELECT" || question.questionType === "MULTIPLE_CHOICE") {
        return aggregateSelectQuestion(
          ctx.db,
          { ...question, questionType: question.questionType },
          survey.id,
        );
      }

      if (question.questionType === "RATING") {
        return aggregateRatingQuestion(ctx.db, question, survey.id);
      }

      // FREE_TEXT
      if (hideFreeText) {
        const totalResponses = await ctx.db.answer.count({
          where: {
            questionId: question.id,
            response: {
              surveyId: survey.id,
              status: "SUBMITTED",
              deletedAt: null,
            },
          },
        });
        return {
          questionId: question.id,
          questionText: question.text,
          questionType: "FREE_TEXT" as const,
          position: question.position,
          totalResponses,
          responses: [],
          page: 1,
          totalPages: 0,
        };
      }

      return aggregateFreeTextQuestion(
        ctx.db,
        question,
        survey.id,
        input.page,
        10,
      );
    }),
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/results.ts
git commit -m "feat: add results.getQuestionAggregation for lazy loading"
```

---

### Task 5: Register the results router in root.ts

**Files:**
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Import and register the results router**

Update `src/server/api/root.ts` to add the results router. The file should look like:

```typescript
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { responseRouter } from "~/server/api/routers/response";
import { resultsRouter } from "~/server/api/routers/results";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  response: responseRouter,
  results: resultsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.results.getBySurvey({ slug: "my-survey" });
 */
export const createCaller = createCallerFactory(appRouter);
```

Note: If the response router from Sub-Plan 2e has not yet been implemented, exclude it from the import and registration. The file should include whichever routers exist at the time of implementation.

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/root.ts
git commit -m "feat: register results router in root"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no TypeScript errors

- [ ] **Step 2: Run lint**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm lint`
Expected: no lint errors. If there are auto-fixable errors, run `pnpm lint:fix` and commit the fixes.

- [ ] **Step 3: Verify dev server starts**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm dev`
Expected: dev server starts without errors. Stop the server after verification.

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: lint and typecheck fixes for results API"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `pnpm typecheck` passes with no errors
- [ ] `pnpm lint` passes with no errors
- [ ] `src/server/api/routers/results.ts` contains `getBySurvey`, `getForCreator`, and `getQuestionAggregation` procedures
- [ ] `src/server/api/root.ts` registers the `results` router
- [ ] `results.getBySurvey` enforces: survey must be CLOSED, access gated by resultsVisibility (PUBLIC/RESPONDENTS/CREATOR)
- [ ] `results.getForCreator` enforces: must be creator, works for PUBLISHED and CLOSED
- [ ] `results.getQuestionAggregation` enforces same access control as `getBySurvey`, supports pagination for free text
- [ ] SINGLE_SELECT aggregation: COUNT + GROUP BY value, percentages sum to 100%
- [ ] MULTIPLE_CHOICE aggregation: parse JSON arrays, COUNT each option, percentage of respondents (can exceed 100%)
- [ ] RATING aggregation: AVG to 1 decimal + distribution bars per value from min to max
- [ ] FREE_TEXT aggregation: paginated list (10 per page, newest first via Response.submittedAt)
- [ ] Private survey + PUBLIC results invariant: free text responses hidden (count only, empty responses array)
- [ ] Only SUBMITTED responses with `deletedAt IS NULL` are included in aggregations
