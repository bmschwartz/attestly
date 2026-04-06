# Sub-Plan 2e: Confirmation & My Responses

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the post-submit confirmation page (`/s/[slug]/confirmation`) and the "My Responses" history page (`/my-responses`). Both are protected routes requiring authentication.

**Architecture:** Next.js App Router pages with tRPC queries for data fetching. The confirmation page shows a success message, survey title, verification proof section, and result/email notices. The My Responses page lists all surveys the user has participated in with status-aware links.

**Tech Stack:** Next.js 16 (App Router), tRPC 11, Prisma 7, Tailwind CSS 4, Zod 4

**Spec references:**
- `docs/superpowers/specs/2026-04-05-respondent-experience-design.md` (confirmation page, my responses)
- `docs/superpowers/specs/2026-04-04-data-model-design.md` (Response, Survey, User models)

---

## File Structure

- Create: `src/server/api/routers/response.ts` — response router with `getConfirmation` and `listMine` procedures
- Modify: `src/server/api/root.ts` — register response router
- Create: `src/app/s/[slug]/confirmation/page.tsx` — confirmation page
- Create: `src/app/my-responses/page.tsx` — my responses list page
- Create: `src/app/_components/response-card.tsx` — reusable response card component

---

### Task 1: Create the response router with `getConfirmation` procedure

**Files:**
- Create: `src/server/api/routers/response.ts`

- [ ] **Step 1: Create the response router file with `getConfirmation`**

Create `src/server/api/routers/response.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

export const responseRouter = createTRPCRouter({
  getConfirmation: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const survey = await ctx.db.survey.findUnique({
        where: { slug: input.slug },
        select: {
          id: true,
          title: true,
          status: true,
          closedAt: true,
          resultsVisibility: true,
        },
      });

      if (!survey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Survey not found",
        });
      }

      const response = await ctx.db.response.findFirst({
        where: {
          surveyId: survey.id,
          respondentId: userId,
          status: "SUBMITTED",
          deletedAt: null,
        },
        select: {
          id: true,
          submittedAt: true,
          blindedId: true,
          ipfsCid: true,
          submitTxHash: true,
          verificationStatus: true,
        },
      });

      if (!response) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No submitted response found for this survey",
        });
      }

      const user = await ctx.db.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      return {
        survey: {
          title: survey.title,
          status: survey.status,
          closedAt: survey.closedAt,
          resultsVisibility: survey.resultsVisibility,
        },
        response: {
          id: response.id,
          submittedAt: response.submittedAt,
          blindedId: response.blindedId,
          ipfsCid: response.ipfsCid,
          submitTxHash: response.submitTxHash,
          verificationStatus: response.verificationStatus,
        },
        respondentEmail: user?.email ?? null,
      };
    }),
});
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors related to `response.ts`

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/response.ts
git commit -m "feat: add response router with getConfirmation procedure"
```

---

### Task 2: Add `listMine` procedure to the response router

**Files:**
- Modify: `src/server/api/routers/response.ts`

- [ ] **Step 1: Add `listMine` to the response router**

Add this procedure inside the `createTRPCRouter({})` call, after `getConfirmation`:

```typescript
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const responses = await ctx.db.response.findMany({
      where: {
        respondentId: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        blindedId: true,
        createdAt: true,
        survey: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            closedAt: true,
            resultsVisibility: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return responses.map((r) => ({
      id: r.id,
      status: r.status,
      submittedAt: r.submittedAt,
      blindedId: r.blindedId,
      createdAt: r.createdAt,
      survey: {
        id: r.survey.id,
        title: r.survey.title,
        slug: r.survey.slug,
        status: r.survey.status,
        closedAt: r.survey.closedAt,
        resultsVisibility: r.survey.resultsVisibility,
      },
    }));
  }),
```

The full file `src/server/api/routers/response.ts` should now contain both `getConfirmation` and `listMine`.

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/response.ts
git commit -m "feat: add listMine procedure to response router"
```

---

### Task 3: Register the response router in root.ts

**Files:**
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Import and register the response router**

Replace the contents of `src/server/api/root.ts` with:

```typescript
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { responseRouter } from "~/server/api/routers/response";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  response: responseRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.response.getConfirmation({ slug: "my-survey" });
 */
export const createCaller = createCallerFactory(appRouter);
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/root.ts
git commit -m "feat: register response router in root"
```

---

### Task 4: Create the Confirmation page

**Files:**
- Create: `src/app/s/[slug]/confirmation/page.tsx`

- [ ] **Step 1: Create the confirmation page**

Create `src/app/s/[slug]/confirmation/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";
import { api } from "~/trpc/react";

function VerificationProofSection({
  blindedId,
  ipfsCid,
  submitTxHash,
  verificationStatus,
}: {
  blindedId: string | null;
  ipfsCid: string | null;
  submitTxHash: string | null;
  verificationStatus: string;
}) {
  return (
    <details className="w-full rounded-lg border border-gray-200 bg-gray-50">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700">
        Verification Proof
      </summary>
      <div className="space-y-2 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
        {blindedId && (
          <div>
            <span className="font-medium text-gray-700">Blinded ID:</span>{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs break-all">
              {blindedId}
            </code>
          </div>
        )}
        <div>
          <span className="font-medium text-gray-700">Status:</span>{" "}
          {verificationStatus === "NONE" ? "Recorded" : verificationStatus}
        </div>
        {ipfsCid && (
          <div>
            <span className="font-medium text-gray-700">IPFS CID:</span>{" "}
            <a
              href={`https://gateway.pinata.cloud/ipfs/${ipfsCid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline break-all"
            >
              {ipfsCid}
            </a>
          </div>
        )}
        {submitTxHash && (
          <div>
            <span className="font-medium text-gray-700">Transaction:</span>{" "}
            <a
              href={`https://basescan.org/tx/${submitTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline break-all"
            >
              {submitTxHash}
            </a>
          </div>
        )}
      </div>
    </details>
  );
}

export default function ConfirmationPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data, isLoading, error } = api.response.getConfirmation.useQuery(
    { slug },
    { enabled: !!slug },
  );

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading confirmation...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">
            Confirmation not found
          </h1>
          <p className="mt-2 text-gray-500">
            {error.message === "No submitted response found for this survey"
              ? "You haven't submitted a response to this survey."
              : "This survey could not be found."}
          </p>
        </div>
      </main>
    );
  }

  if (!data) {
    return null;
  }

  const { survey, response, respondentEmail } = data;
  const isClosed = survey.status === "CLOSED";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-6 text-center">
        {/* Success icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>

        {/* Success message */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Response Submitted
          </h1>
          <p className="mt-1 text-gray-600">{survey.title}</p>
          {response.submittedAt && (
            <p className="mt-1 text-sm text-gray-400">
              Submitted{" "}
              {new Date(response.submittedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>

        {/* Verification proof */}
        <VerificationProofSection
          blindedId={response.blindedId}
          ipfsCid={response.ipfsCid}
          submitTxHash={response.submitTxHash}
          verificationStatus={response.verificationStatus}
        />

        {/* Results notice */}
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {isClosed ? (
            <p>
              Results are available.{" "}
              <a
                href={`/s/${slug}/results`}
                className="font-medium underline"
              >
                View results
              </a>
            </p>
          ) : (
            <p>
              Survey results will be available when this survey closes.
            </p>
          )}
        </div>

        {/* Email notice */}
        <div className="text-sm text-gray-500">
          {respondentEmail ? (
            <p>
              We&apos;ll send you an email at{" "}
              <span className="font-medium text-gray-700">
                {respondentEmail}
              </span>{" "}
              when results are ready.
            </p>
          ) : (
            <p>
              Add an email to be notified when results are ready.
            </p>
          )}
        </div>

        {/* Navigation links */}
        <div className="flex justify-center gap-4 pt-2">
          <a
            href="/my-responses"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            My Responses
          </a>
          <a
            href="/"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Home
          </a>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/s/\[slug\]/confirmation/page.tsx
git commit -m "feat: add confirmation page at /s/[slug]/confirmation"
```

---

### Task 5: Create the ResponseCard component

**Files:**
- Create: `src/app/_components/response-card.tsx`

- [ ] **Step 1: Create the ResponseCard component**

Create `src/app/_components/response-card.tsx`:

```tsx
import type { RouterOutputs } from "~/trpc/react";

type MyResponse = RouterOutputs["response"]["listMine"][number];

function getStatusInfo(response: MyResponse): {
  label: string;
  color: string;
  href: string;
  linkText: string;
} {
  if (response.status === "IN_PROGRESS") {
    return {
      label: "In Progress",
      color: "bg-yellow-100 text-yellow-800",
      href: `/s/${response.survey.slug}/respond`,
      linkText: "Resume",
    };
  }

  if (response.survey.status === "CLOSED") {
    return {
      label: "Results Available",
      color: "bg-green-100 text-green-800",
      href: `/s/${response.survey.slug}/results`,
      linkText: "View Results",
    };
  }

  return {
    label: "Submitted, awaiting results",
    color: "bg-blue-100 text-blue-800",
    href: `/s/${response.survey.slug}/confirmation`,
    linkText: "View Confirmation",
  };
}

export function ResponseCard({ response }: { response: MyResponse }) {
  const statusInfo = getStatusInfo(response);

  const displayDate = response.submittedAt ?? response.createdAt;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <a
            href={`/s/${response.survey.slug}`}
            className="text-base font-semibold text-gray-900 hover:text-blue-600"
          >
            {response.survey.title}
          </a>
          <p className="mt-1 text-sm text-gray-500">
            {response.status === "IN_PROGRESS" ? "Started" : "Submitted"}{" "}
            {new Date(displayDate).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>

        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}
        >
          {statusInfo.label}
        </span>
      </div>

      {response.blindedId && (
        <p className="mt-2 text-xs text-gray-400">
          ID:{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5">
            {response.blindedId.slice(0, 12)}...
          </code>
        </p>
      )}

      <div className="mt-3 border-t border-gray-100 pt-3">
        <a
          href={statusInfo.href}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          {statusInfo.linkText} &rarr;
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/response-card.tsx
git commit -m "feat: add ResponseCard component for my responses list"
```

---

### Task 6: Create the My Responses page

**Files:**
- Create: `src/app/my-responses/page.tsx`

- [ ] **Step 1: Create the My Responses page**

Create `src/app/my-responses/page.tsx`:

```tsx
"use client";

import { api } from "~/trpc/react";
import { ResponseCard } from "~/app/_components/response-card";

export default function MyResponsesPage() {
  const { data: responses, isLoading, error } = api.response.listMine.useQuery();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900">My Responses</h1>
        <p className="mt-4 text-gray-500">Loading your responses...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900">My Responses</h1>
        <p className="mt-4 text-red-600">
          Failed to load responses. Please try again.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900">My Responses</h1>
      <p className="mt-1 text-sm text-gray-500">
        Surveys you&apos;ve participated in
      </p>

      {!responses || responses.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-gray-500">
            You haven&apos;t responded to any surveys yet.
          </p>
          <a
            href="/"
            className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Explore surveys &rarr;
          </a>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {responses.map((response) => (
            <ResponseCard key={response.id} response={response} />
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/my-responses/page.tsx
git commit -m "feat: add My Responses page at /my-responses"
```

---

### Task 7: Final verification

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
git commit -m "fix: lint and typecheck fixes for confirmation and my-responses"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `pnpm typecheck` passes with no errors
- [ ] `pnpm lint` passes with no errors
- [ ] `src/server/api/routers/response.ts` contains `getConfirmation` and `listMine` procedures
- [ ] `src/server/api/root.ts` registers the `response` router
- [ ] `/s/[slug]/confirmation` page renders success message, survey title, verification proof, results notice, and email notice
- [ ] `/my-responses` page renders a list of ResponseCard components sorted by most recent
- [ ] ResponseCard shows survey title, submitted date, status badge, and appropriate link
- [ ] Empty state handled when user has no responses
- [ ] Error states handled for both pages
