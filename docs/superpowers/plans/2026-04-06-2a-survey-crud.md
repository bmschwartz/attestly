# Sub-Plan 2a: Survey CRUD Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement tRPC routers for survey create, update, publish, delete, get, list, stats, and close operations.

**Architecture:** A single `surveyRouter` in `src/server/api/routers/survey.ts` exposes all survey-level tRPC procedures. All mutations use Zod input validation. Protected procedures use `ctx.session.user.id` as the creator identity. Creator-ownership is enforced at the query level for edit/delete operations. Publish validation mirrors the client-side rules as a server-side gate.

**Tech Stack:** tRPC v11, Zod v4, Prisma 7, PostgreSQL, Vitest

**Spec reference:** `docs/superpowers/specs/2026-04-05-survey-builder-design.md`, `docs/superpowers/specs/2026-04-04-data-model-design.md`

---

## File Structure

- Create: `src/server/api/routers/survey.ts` — survey router with all procedures
- Modify: `src/server/api/root.ts` — register survey router
- Create: `vitest.config.ts` — vitest configuration (if not present)
- Create: `src/server/api/routers/__tests__/survey.test.ts` — tests

---

### Task 1: Set up Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install vitest and dependencies**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm add -D vitest @vitest/coverage-v8
```

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/__tests__/**"],
    },
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Add test script to package.json**

Add to the `"scripts"` section of `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify vitest runs**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm test
```

Expected: vitest runs and reports 0 test files (no tests yet). No errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/bmschwartz/Development/attestly && git add vitest.config.ts package.json pnpm-lock.yaml && git commit -m "chore: add vitest configuration and test scripts"
```

---

### Task 2: Create the survey router file with `survey.create`

**Files:**
- Create: `src/server/api/routers/survey.ts`

- [ ] **Step 1: Create the survey router with the `create` procedure**

Create `src/server/api/routers/survey.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";

/**
 * Slugify a string: lowercase, replace non-alphanumeric with hyphens, trim hyphens.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generate a random 4-character alphanumeric suffix.
 */
function randomSuffix(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const VALID_CATEGORIES = [
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

export const surveyRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200).optional().default("Untitled Survey"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slug = `${slugify(input.title)}-${randomSuffix()}`;

      const survey = await ctx.db.survey.create({
        data: {
          creatorId: ctx.session.user.id,
          title: input.title,
          description: "",
          slug,
          categories: [],
          tags: [],
        },
      });

      return { id: survey.id };
    }),
});
```

- [ ] **Step 2: Verify file compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

Expected: no TypeScript errors. If there are errors related to Prisma types not being generated yet, run `pnpm prisma generate` first.

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly && git add src/server/api/routers/survey.ts && git commit -m "feat: add survey router with create procedure"
```

---

### Task 3: Add `survey.update` (auto-save mutation)

**Files:**
- Modify: `src/server/api/routers/survey.ts`

- [ ] **Step 1: Add the `update` procedure to the survey router**

Add after the `create` procedure inside the `createTRPCRouter({})` call in `src/server/api/routers/survey.ts`:

```typescript
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().max(200).optional(),
        description: z.string().max(2000).optional(),
        slug: z.string().max(200).optional(),
        isPrivate: z.boolean().optional(),
        accessMode: z.enum(["OPEN", "INVITE_ONLY"]).optional(),
        resultsVisibility: z.enum(["PUBLIC", "RESPONDENTS", "CREATOR"]).optional(),
        categories: z
          .array(z.enum(VALID_CATEGORIES))
          .max(5)
          .optional(),
        tags: z
          .array(z.string().max(50))
          .max(10)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      // Verify ownership and DRAFT status
      const survey = await ctx.db.survey.findUnique({
        where: { id },
        select: { creatorId: true, status: true },
      });

      if (!survey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }

      if (survey.creatorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not the survey creator" });
      }

      if (survey.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft surveys can be edited",
        });
      }

      // Transform tags to lowercase and trimmed
      const updateData: Record<string, unknown> = { ...data };
      if (data.tags) {
        updateData.tags = data.tags.map((t) => t.toLowerCase().trim()).filter(Boolean);
      }

      const updated = await ctx.db.survey.update({
        where: { id },
        data: updateData,
      });

      return { id: updated.id };
    }),
```

- [ ] **Step 2: Verify file compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly && git add src/server/api/routers/survey.ts && git commit -m "feat: add survey.update procedure for auto-save"
```

---

### Task 4: Add `survey.getForEdit`

**Files:**
- Modify: `src/server/api/routers/survey.ts`

- [ ] **Step 1: Add the `getForEdit` procedure**

Add to the router in `src/server/api/routers/survey.ts`:

```typescript
  getForEdit: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { id: input.id },
        include: {
          questions: {
            orderBy: { position: "asc" },
          },
        },
      });

      if (!survey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }

      if (survey.creatorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not the survey creator" });
      }

      return survey;
    }),
```

- [ ] **Step 2: Verify file compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly && git add src/server/api/routers/survey.ts && git commit -m "feat: add survey.getForEdit procedure"
```

---

### Task 5: Add `survey.getBySlug`

**Files:**
- Modify: `src/server/api/routers/survey.ts`

- [ ] **Step 1: Add the `getBySlug` procedure**

Add to the router in `src/server/api/routers/survey.ts`:

```typescript
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { slug: input.slug },
        include: {
          questions: {
            orderBy: { position: "asc" },
          },
          creator: {
            select: {
              id: true,
              displayName: true,
              avatar: true,
            },
          },
          _count: {
            select: {
              responses: {
                where: { status: "SUBMITTED", deletedAt: null },
              },
            },
          },
        },
      });

      if (!survey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }

      if (survey.status === "DRAFT") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Survey not found",
        });
      }

      return survey;
    }),
```

- [ ] **Step 2: Verify file compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly && git add src/server/api/routers/survey.ts && git commit -m "feat: add survey.getBySlug procedure for public landing page"
```

---

### Task 6: Add `survey.publish` with full validation

**Files:**
- Modify: `src/server/api/routers/survey.ts`

- [ ] **Step 1: Add the `publish` procedure**

Add to the router in `src/server/api/routers/survey.ts`:

```typescript
  publish: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { id: input.id },
        include: {
          questions: {
            orderBy: { position: "asc" },
          },
        },
      });

      if (!survey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }

      if (survey.creatorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not the survey creator" });
      }

      if (survey.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft surveys can be published",
        });
      }

      // Collect all validation errors
      const errors: string[] = [];

      // Survey-level validations
      if (!survey.title || survey.title.length === 0) {
        errors.push("Survey title is required");
      } else if (survey.title.length > 200) {
        errors.push("Title must be under 200 characters");
      }

      if (!survey.description || survey.description.length === 0) {
        errors.push("Survey description is required");
      } else if (survey.description.length > 2000) {
        errors.push("Description must be under 2000 characters");
      }

      // Question count
      if (survey.questions.length === 0) {
        errors.push("Survey must have at least 1 question");
      } else if (survey.questions.length > 100) {
        errors.push("Survey cannot have more than 100 questions");
      }

      // Categories
      const categories = survey.categories as string[];
      if (!categories || categories.length === 0) {
        errors.push("Select at least 1 category");
      } else if (categories.length > 5) {
        errors.push("Maximum 5 categories");
      }

      // Tags
      const tags = survey.tags as string[];
      if (tags && tags.length > 10) {
        errors.push("Maximum 10 tags");
      }

      // Question-level validations
      for (let i = 0; i < survey.questions.length; i++) {
        const q = survey.questions[i]!;
        const n = i + 1;

        if (!q.text || q.text.trim().length === 0) {
          errors.push(`Question ${n} is missing text`);
        }

        const options = q.options as string[];

        if (
          q.questionType === "SINGLE_SELECT" ||
          q.questionType === "MULTIPLE_CHOICE"
        ) {
          if (!options || options.length < 2) {
            errors.push(`Question ${n} must have at least 2 options`);
          } else {
            for (const opt of options) {
              if (!opt || opt.trim().length === 0) {
                errors.push(`Question ${n} has an empty option`);
                break;
              }
            }

            const uniqueOptions = new Set(options.map((o) => o.trim().toLowerCase()));
            if (uniqueOptions.size !== options.length) {
              errors.push(`Question ${n} has duplicate options`);
            }
          }
        }

        if (q.questionType === "RATING") {
          if (q.minRating == null || q.maxRating == null) {
            errors.push(`Question ${n}: min and max rating are required`);
          } else if (q.minRating >= q.maxRating) {
            errors.push(`Question ${n}: min rating must be less than max`);
          }
        }

        if (q.questionType === "FREE_TEXT") {
          if (q.maxLength == null || q.maxLength <= 0) {
            errors.push(`Question ${n}: max length must be greater than 0`);
          }
        }
      }

      // Slug uniqueness check
      const existingSurveyWithSlug = await ctx.db.survey.findFirst({
        where: {
          slug: survey.slug,
          id: { not: survey.id },
        },
        select: { id: true },
      });

      if (existingSurveyWithSlug) {
        errors.push("This URL slug is already taken");
      }

      if (errors.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: errors.join("; "),
          cause: { validationErrors: errors },
        });
      }

      // Transition to PUBLISHED
      const updated = await ctx.db.survey.update({
        where: { id: input.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });

      return { id: updated.id, slug: updated.slug };
    }),
```

- [ ] **Step 2: Verify file compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly && git add src/server/api/routers/survey.ts && git commit -m "feat: add survey.publish procedure with full validation"
```

---

### Task 7: Add `survey.deleteDraft`

**Files:**
- Modify: `src/server/api/routers/survey.ts`

- [ ] **Step 1: Add the `deleteDraft` procedure**

Add to the router in `src/server/api/routers/survey.ts`:

```typescript
  deleteDraft: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { id: input.id },
        select: { creatorId: true, status: true },
      });

      if (!survey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }

      if (survey.creatorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not the survey creator" });
      }

      if (survey.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft surveys can be deleted",
        });
      }

      // Hard delete — cascades to questions via Prisma relation onDelete
      await ctx.db.survey.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
```

- [ ] **Step 2: Verify file compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly && git add src/server/api/routers/survey.ts && git commit -m "feat: add survey.deleteDraft procedure"
```

---

### Task 8: Add `survey.listMine`

**Files:**
- Modify: `src/server/api/routers/survey.ts`

- [ ] **Step 1: Add the `listMine` procedure**

Add to the router in `src/server/api/routers/survey.ts`:

```typescript
  listMine: protectedProcedure
    .input(
      z.object({
        status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).optional(),
        limit: z.number().min(1).max(100).optional().default(50),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const surveys = await ctx.db.survey.findMany({
        where: {
          creatorId: ctx.session.user.id,
          ...(input.status ? { status: input.status } : {}),
        },
        include: {
          _count: {
            select: {
              responses: {
                where: { status: "SUBMITTED", deletedAt: null },
              },
              questions: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor
          ? {
              cursor: { id: input.cursor },
              skip: 1,
            }
          : {}),
      });

      let nextCursor: string | undefined;
      if (surveys.length > input.limit) {
        const nextItem = surveys.pop();
        nextCursor = nextItem?.id;
      }

      return {
        surveys,
        nextCursor,
      };
    }),
```

- [ ] **Step 2: Verify file compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly && git add src/server/api/routers/survey.ts && git commit -m "feat: add survey.listMine procedure with cursor pagination"
```

---

### Task 9: Add `survey.getStats`

**Files:**
- Modify: `src/server/api/routers/survey.ts`

- [ ] **Step 1: Add the `getStats` procedure**

Add to the router in `src/server/api/routers/survey.ts`:

```typescript
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [totalSurveys, totalResponses, activeSurveys] = await Promise.all([
      ctx.db.survey.count({
        where: { creatorId: userId },
      }),
      ctx.db.response.count({
        where: {
          survey: { creatorId: userId },
          status: "SUBMITTED",
          deletedAt: null,
        },
      }),
      ctx.db.survey.count({
        where: { creatorId: userId, status: "PUBLISHED" },
      }),
    ]);

    return {
      totalSurveys,
      totalResponses,
      activeSurveys,
    };
  }),
```

- [ ] **Step 2: Verify file compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly && git add src/server/api/routers/survey.ts && git commit -m "feat: add survey.getStats procedure for dashboard overview"
```

---

### Task 10: Add `survey.close`

**Files:**
- Modify: `src/server/api/routers/survey.ts`

- [ ] **Step 1: Add the `close` procedure**

Add to the router in `src/server/api/routers/survey.ts`:

```typescript
  close: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { id: input.id },
        select: { creatorId: true, status: true },
      });

      if (!survey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }

      if (survey.creatorId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not the survey creator" });
      }

      if (survey.status !== "PUBLISHED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only published surveys can be closed",
        });
      }

      const now = new Date();

      // Use a transaction: close the survey and soft-delete IN_PROGRESS responses
      await ctx.db.$transaction([
        ctx.db.survey.update({
          where: { id: input.id },
          data: {
            status: "CLOSED",
            closedAt: now,
          },
        }),
        ctx.db.response.updateMany({
          where: {
            surveyId: input.id,
            status: "IN_PROGRESS",
            deletedAt: null,
          },
          data: {
            deletedAt: now,
          },
        }),
      ]);

      return { success: true };
    }),
```

- [ ] **Step 2: Verify file compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly && git add src/server/api/routers/survey.ts && git commit -m "feat: add survey.close procedure with soft-delete of in-progress responses"
```

---

### Task 11: Register the survey router in root.ts

**Files:**
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Import and register the survey router**

Update `src/server/api/root.ts` to:

```typescript
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { surveyRouter } from "~/server/api/routers/survey";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  survey: surveyRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.survey.listMine();
 */
export const createCaller = createCallerFactory(appRouter);
```

- [ ] **Step 2: Verify the full app compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly && git add src/server/api/root.ts && git commit -m "feat: register survey router in root tRPC router"
```

---

### Task 12: Write tests for survey procedures

**Files:**
- Create: `src/server/api/routers/__tests__/survey.test.ts`

- [ ] **Step 1: Create the test file with mocked Prisma**

Create `src/server/api/routers/__tests__/survey.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { inferProcedureInput } from "@trpc/server";

import { appRouter, type AppRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";

// Type helpers
type SurveyCreateInput = inferProcedureInput<AppRouter["survey"]["create"]>;
type SurveyUpdateInput = inferProcedureInput<AppRouter["survey"]["update"]>;

// Mock Prisma
const mockPrisma = {
  survey: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  response: {
    count: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

// Helper to create a caller with a mocked context
function createAuthenticatedCaller(userId = "user-1") {
  const createCaller = createCallerFactory(appRouter);
  return createCaller({
    db: mockPrisma as any,
    session: {
      user: { id: userId, name: "Test User", email: "test@test.com" },
      expires: new Date(Date.now() + 86400000).toISOString(),
    },
    headers: new Headers(),
  });
}

function createUnauthenticatedCaller() {
  const createCaller = createCallerFactory(appRouter);
  return createCaller({
    db: mockPrisma as any,
    session: null,
    headers: new Headers(),
  });
}

describe("survey router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("survey.create", () => {
    it("creates a draft survey with auto-generated slug", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.create.mockResolvedValue({
        id: "survey-1",
        slug: "my-survey-abc1",
      });

      const result = await caller.survey.create({ title: "My Survey" });

      expect(result).toEqual({ id: "survey-1" });
      expect(mockPrisma.survey.create).toHaveBeenCalledOnce();

      const createArg = mockPrisma.survey.create.mock.calls[0]![0]!;
      expect(createArg.data.creatorId).toBe("user-1");
      expect(createArg.data.title).toBe("My Survey");
      expect(createArg.data.slug).toMatch(/^my-survey-[a-z0-9]{4}$/);
      expect(createArg.data.description).toBe("");
    });

    it("creates with default title when none provided", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.create.mockResolvedValue({
        id: "survey-2",
        slug: "untitled-survey-xyz9",
      });

      const result = await caller.survey.create({});

      expect(result).toEqual({ id: "survey-2" });
      const createArg = mockPrisma.survey.create.mock.calls[0]![0]!;
      expect(createArg.data.title).toBe("Untitled Survey");
    });

    it("rejects unauthenticated users", async () => {
      const caller = createUnauthenticatedCaller();
      await expect(caller.survey.create({ title: "Test" })).rejects.toThrow(
        TRPCError,
      );
    });
  });

  describe("survey.update", () => {
    it("updates a draft survey", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue({
        creatorId: "user-1",
        status: "DRAFT",
      });
      mockPrisma.survey.update.mockResolvedValue({ id: "survey-1" });

      const result = await caller.survey.update({
        id: "00000000-0000-0000-0000-000000000001",
        title: "Updated Title",
        categories: ["Research", "Education"],
        tags: ["Test Tag", " spaces "],
      });

      expect(result).toEqual({ id: "survey-1" });
      const updateArg = mockPrisma.survey.update.mock.calls[0]![0]!;
      expect(updateArg.data.title).toBe("Updated Title");
      // Tags should be lowercased and trimmed
      expect(updateArg.data.tags).toEqual(["test tag", "spaces"]);
    });

    it("rejects non-creator", async () => {
      const caller = createAuthenticatedCaller("user-2");
      mockPrisma.survey.findUnique.mockResolvedValue({
        creatorId: "user-1",
        status: "DRAFT",
      });

      await expect(
        caller.survey.update({
          id: "00000000-0000-0000-0000-000000000001",
          title: "Hacked",
        }),
      ).rejects.toThrow("Not the survey creator");
    });

    it("rejects updates to published surveys", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue({
        creatorId: "user-1",
        status: "PUBLISHED",
      });

      await expect(
        caller.survey.update({
          id: "00000000-0000-0000-0000-000000000001",
          title: "Edit",
        }),
      ).rejects.toThrow("Only draft surveys can be edited");
    });
  });

  describe("survey.getForEdit", () => {
    it("returns survey with questions for the creator", async () => {
      const caller = createAuthenticatedCaller();
      const mockSurvey = {
        id: "survey-1",
        creatorId: "user-1",
        title: "Test",
        questions: [{ id: "q-1", position: 0 }],
      };
      mockPrisma.survey.findUnique.mockResolvedValue(mockSurvey);

      const result = await caller.survey.getForEdit({
        id: "00000000-0000-0000-0000-000000000001",
      });

      expect(result).toEqual(mockSurvey);
    });

    it("rejects non-creator", async () => {
      const caller = createAuthenticatedCaller("user-2");
      mockPrisma.survey.findUnique.mockResolvedValue({
        id: "survey-1",
        creatorId: "user-1",
      });

      await expect(
        caller.survey.getForEdit({
          id: "00000000-0000-0000-0000-000000000001",
        }),
      ).rejects.toThrow("Not the survey creator");
    });
  });

  describe("survey.getBySlug", () => {
    it("returns a published survey", async () => {
      const caller = createUnauthenticatedCaller();
      const mockSurvey = {
        id: "survey-1",
        status: "PUBLISHED",
        slug: "test-slug",
        creator: { id: "user-1", displayName: "Test", avatar: null },
        questions: [],
        _count: { responses: 5 },
      };
      mockPrisma.survey.findUnique.mockResolvedValue(mockSurvey);

      const result = await caller.survey.getBySlug({ slug: "test-slug" });

      expect(result.slug).toBe("test-slug");
    });

    it("hides draft surveys from public", async () => {
      const caller = createUnauthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue({
        id: "survey-1",
        status: "DRAFT",
        slug: "draft-slug",
      });

      await expect(
        caller.survey.getBySlug({ slug: "draft-slug" }),
      ).rejects.toThrow("Survey not found");
    });

    it("returns NOT_FOUND for missing survey", async () => {
      const caller = createUnauthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue(null);

      await expect(
        caller.survey.getBySlug({ slug: "nonexistent" }),
      ).rejects.toThrow("Survey not found");
    });
  });

  describe("survey.publish", () => {
    const validSurvey = {
      id: "survey-1",
      creatorId: "user-1",
      status: "DRAFT",
      title: "Valid Title",
      description: "Valid description for the survey",
      slug: "valid-slug-1234",
      categories: ["Research"],
      tags: ["test"],
      questions: [
        {
          id: "q-1",
          text: "Pick one",
          questionType: "SINGLE_SELECT",
          options: ["A", "B"],
          minRating: null,
          maxRating: null,
          maxLength: null,
        },
      ],
    };

    it("publishes a valid survey", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue(validSurvey);
      mockPrisma.survey.findFirst.mockResolvedValue(null); // no slug conflict
      mockPrisma.survey.update.mockResolvedValue({
        id: "survey-1",
        slug: "valid-slug-1234",
      });

      const result = await caller.survey.publish({
        id: "00000000-0000-0000-0000-000000000001",
      });

      expect(result).toEqual({ id: "survey-1", slug: "valid-slug-1234" });
      const updateArg = mockPrisma.survey.update.mock.calls[0]![0]!;
      expect(updateArg.data.status).toBe("PUBLISHED");
      expect(updateArg.data.publishedAt).toBeInstanceOf(Date);
    });

    it("rejects survey with no title", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue({
        ...validSurvey,
        title: "",
      });
      mockPrisma.survey.findFirst.mockResolvedValue(null);

      await expect(
        caller.survey.publish({
          id: "00000000-0000-0000-0000-000000000001",
        }),
      ).rejects.toThrow("Survey title is required");
    });

    it("rejects survey with no questions", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue({
        ...validSurvey,
        questions: [],
      });
      mockPrisma.survey.findFirst.mockResolvedValue(null);

      await expect(
        caller.survey.publish({
          id: "00000000-0000-0000-0000-000000000001",
        }),
      ).rejects.toThrow("Survey must have at least 1 question");
    });

    it("rejects survey with no categories", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue({
        ...validSurvey,
        categories: [],
      });
      mockPrisma.survey.findFirst.mockResolvedValue(null);

      await expect(
        caller.survey.publish({
          id: "00000000-0000-0000-0000-000000000001",
        }),
      ).rejects.toThrow("Select at least 1 category");
    });

    it("rejects choice question with fewer than 2 options", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue({
        ...validSurvey,
        questions: [
          {
            ...validSurvey.questions[0],
            options: ["Only One"],
          },
        ],
      });
      mockPrisma.survey.findFirst.mockResolvedValue(null);

      await expect(
        caller.survey.publish({
          id: "00000000-0000-0000-0000-000000000001",
        }),
      ).rejects.toThrow("Question 1 must have at least 2 options");
    });

    it("rejects choice question with duplicate options", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue({
        ...validSurvey,
        questions: [
          {
            ...validSurvey.questions[0],
            options: ["Same", "same"],
          },
        ],
      });
      mockPrisma.survey.findFirst.mockResolvedValue(null);

      await expect(
        caller.survey.publish({
          id: "00000000-0000-0000-0000-000000000001",
        }),
      ).rejects.toThrow("Question 1 has duplicate options");
    });

    it("rejects rating question with min >= max", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue({
        ...validSurvey,
        questions: [
          {
            id: "q-1",
            text: "Rate this",
            questionType: "RATING",
            options: [],
            minRating: 5,
            maxRating: 3,
            maxLength: null,
          },
        ],
      });
      mockPrisma.survey.findFirst.mockResolvedValue(null);

      await expect(
        caller.survey.publish({
          id: "00000000-0000-0000-0000-000000000001",
        }),
      ).rejects.toThrow("Question 1: min rating must be less than max");
    });

    it("rejects free text question with maxLength <= 0", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue({
        ...validSurvey,
        questions: [
          {
            id: "q-1",
            text: "Write something",
            questionType: "FREE_TEXT",
            options: [],
            minRating: null,
            maxRating: null,
            maxLength: 0,
          },
        ],
      });
      mockPrisma.survey.findFirst.mockResolvedValue(null);

      await expect(
        caller.survey.publish({
          id: "00000000-0000-0000-0000-000000000001",
        }),
      ).rejects.toThrow("Question 1: max length must be greater than 0");
    });

    it("rejects duplicate slug", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue(validSurvey);
      mockPrisma.survey.findFirst.mockResolvedValue({ id: "other-survey" });

      await expect(
        caller.survey.publish({
          id: "00000000-0000-0000-0000-000000000001",
        }),
      ).rejects.toThrow("This URL slug is already taken");
    });
  });

  describe("survey.deleteDraft", () => {
    it("deletes a draft survey", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue({
        creatorId: "user-1",
        status: "DRAFT",
      });
      mockPrisma.survey.delete.mockResolvedValue({});

      const result = await caller.survey.deleteDraft({
        id: "00000000-0000-0000-0000-000000000001",
      });

      expect(result).toEqual({ success: true });
    });

    it("rejects deleting a published survey", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue({
        creatorId: "user-1",
        status: "PUBLISHED",
      });

      await expect(
        caller.survey.deleteDraft({
          id: "00000000-0000-0000-0000-000000000001",
        }),
      ).rejects.toThrow("Only draft surveys can be deleted");
    });
  });

  describe("survey.listMine", () => {
    it("returns paginated list of creator surveys", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findMany.mockResolvedValue([
        {
          id: "survey-1",
          title: "Survey 1",
          _count: { responses: 3, questions: 5 },
        },
      ]);

      const result = await caller.survey.listMine({});

      expect(result.surveys).toHaveLength(1);
      expect(result.nextCursor).toBeUndefined();
    });

    it("returns nextCursor when more results exist", async () => {
      const caller = createAuthenticatedCaller();
      const surveys = Array.from({ length: 51 }, (_, i) => ({
        id: `survey-${i}`,
        title: `Survey ${i}`,
        _count: { responses: 0, questions: 0 },
      }));
      mockPrisma.survey.findMany.mockResolvedValue(surveys);

      const result = await caller.survey.listMine({ limit: 50 });

      expect(result.surveys).toHaveLength(50);
      expect(result.nextCursor).toBe("survey-50");
    });
  });

  describe("survey.getStats", () => {
    it("returns aggregated stats for the creator", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.count
        .mockResolvedValueOnce(10) // totalSurveys
        .mockResolvedValueOnce(3); // activeSurveys
      mockPrisma.response.count.mockResolvedValueOnce(50); // totalResponses

      const result = await caller.survey.getStats();

      expect(result).toEqual({
        totalSurveys: 10,
        totalResponses: 50,
        activeSurveys: 3,
      });
    });
  });

  describe("survey.close", () => {
    it("closes a published survey and soft-deletes in-progress responses", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue({
        creatorId: "user-1",
        status: "PUBLISHED",
      });
      mockPrisma.$transaction.mockResolvedValue([{}, { count: 2 }]);

      const result = await caller.survey.close({
        id: "00000000-0000-0000-0000-000000000001",
      });

      expect(result).toEqual({ success: true });
      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    });

    it("rejects closing a draft survey", async () => {
      const caller = createAuthenticatedCaller();
      mockPrisma.survey.findUnique.mockResolvedValue({
        creatorId: "user-1",
        status: "DRAFT",
      });

      await expect(
        caller.survey.close({
          id: "00000000-0000-0000-0000-000000000001",
        }),
      ).rejects.toThrow("Only published surveys can be closed");
    });

    it("rejects closing a survey you don't own", async () => {
      const caller = createAuthenticatedCaller("user-2");
      mockPrisma.survey.findUnique.mockResolvedValue({
        creatorId: "user-1",
        status: "PUBLISHED",
      });

      await expect(
        caller.survey.close({
          id: "00000000-0000-0000-0000-000000000001",
        }),
      ).rejects.toThrow("Not the survey creator");
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm test
```

Expected: all tests pass. If there are import resolution issues with the `~` alias, verify the vitest config has the correct alias mapping.

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly && git add src/server/api/routers/__tests__/survey.test.ts && git commit -m "test: add comprehensive tests for all survey router procedures"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `pnpm typecheck` — no TypeScript errors
- [ ] `pnpm test` — all survey tests pass
- [ ] Survey router is registered in `src/server/api/root.ts`
- [ ] All 10 procedures exist: create, update, getForEdit, getBySlug, publish, deleteDraft, listMine, getStats, close
- [ ] All mutations have Zod input validation
- [ ] Publish validates: title (required, max 200), description (required, max 2000), 1-100 questions, categories 1-5, tags <=10, slug unique, question-level rules
- [ ] Creator ownership enforced on: update, getForEdit, publish, deleteDraft, close
- [ ] DRAFT-only enforced on: update, deleteDraft
- [ ] PUBLISHED-only enforced on: close
- [ ] Close uses a transaction to update status and soft-delete IN_PROGRESS responses
