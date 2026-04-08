# Sub-Plan 3b: Results UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the results page at `/s/[slug]/results` with per-question visualizations: horizontal bar charts for select questions, average + distribution for ratings, and paginated free text lists. Includes an access gate component that handles PUBLIC/RESPONDENTS/CREATOR visibility.

**Architecture:** Next.js App Router client page with tRPC queries. The page checks `resultsVisibility` and auth state to show/hide content. Visualization components are pure presentational — they receive aggregated data from the tRPC layer. No charting libraries; bar charts are CSS-based using Tailwind width utilities.

**Tech Stack:** Next.js 16 (App Router), tRPC 11, Tailwind CSS 4, React 19

**Spec references:**
- `docs/superpowers/specs/2026-04-05-results-analytics-design.md` (results page layout, per-question visualizations, access control)
- `docs/superpowers/specs/2026-04-05-respondent-experience-design.md` (results page route, access states)

**Dependencies:** Sub-Plan 3a (results API) must be completed first. The `results.getBySurvey` and `results.getQuestionAggregation` tRPC procedures must exist.

---

## File Structure

- Create: `src/app/s/[slug]/results/page.tsx` — results page
- Create: `src/app/_components/results/results-access-gate.tsx` — access gate component
- Create: `src/app/_components/results/bar-chart.tsx` — horizontal bar chart for SINGLE_SELECT and MULTIPLE_CHOICE
- Create: `src/app/_components/results/rating-result.tsx` — average + distribution for RATING
- Create: `src/app/_components/results/free-text-list.tsx` — paginated text list for FREE_TEXT
- Create: `src/app/_components/results/question-results-list.tsx` — renders all questions in order, dispatches to appropriate visualization

---

### Task 1: Create the BarChart component

**Files:**
- Create: `src/app/_components/results/bar-chart.tsx`

- [ ] **Step 1: Create the BarChart component**

Create `src/app/_components/results/bar-chart.tsx`:

```tsx
type BarChartOption = {
  value: string;
  count: number;
  percentage: number;
};

export function BarChart({
  options,
  totalResponses,
  questionType,
}: {
  options: BarChartOption[];
  totalResponses: number;
  questionType: "SINGLE_SELECT" | "MULTIPLE_CHOICE";
}) {
  const maxPercentage = Math.max(...options.map((o) => o.percentage), 1);

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        ({questionType === "SINGLE_SELECT" ? "Single Select" : "Multiple Choice"}{" "}
        &middot; {totalResponses} response{totalResponses !== 1 ? "s" : ""})
      </p>
      {options.map((option) => (
        <div key={option.value} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">{option.value}</span>
            <span className="text-gray-500">
              {option.count} ({option.percentage}%)
            </span>
          </div>
          <div className="h-6 w-full rounded-full bg-gray-100">
            <div
              className="h-6 rounded-full bg-blue-500 transition-all duration-300"
              style={{
                width: `${maxPercentage > 0 ? (option.percentage / maxPercentage) * 100 : 0}%`,
                minWidth: option.count > 0 ? "0.5rem" : "0",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/results/bar-chart.tsx
git commit -m "feat: add BarChart component for select question results"
```

---

### Task 2: Create the RatingResult component

**Files:**
- Create: `src/app/_components/results/rating-result.tsx`

- [ ] **Step 1: Create the RatingResult component**

Create `src/app/_components/results/rating-result.tsx`:

```tsx
type DistributionItem = {
  value: number;
  count: number;
  percentage: number;
};

export function RatingResult({
  average,
  distribution,
  totalResponses,
  minRating,
  maxRating,
}: {
  average: number;
  distribution: DistributionItem[];
  totalResponses: number;
  minRating: number;
  maxRating: number;
}) {
  const maxPercentage = Math.max(...distribution.map((d) => d.percentage), 1);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        (Rating {minRating}-{maxRating} &middot; {totalResponses} response
        {totalResponses !== 1 ? "s" : ""})
      </p>

      {/* Average display */}
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold text-gray-900">
          {average.toFixed(1)}
        </span>
        <span className="text-sm text-gray-500">
          out of {maxRating}
        </span>
      </div>

      {/* Distribution bars */}
      <div className="space-y-2">
        {distribution.map((item) => (
          <div key={item.value} className="flex items-center gap-3">
            <span className="w-6 text-right text-sm font-medium text-gray-600">
              {item.value}
            </span>
            <div className="h-5 flex-1 rounded-full bg-gray-100">
              <div
                className="h-5 rounded-full bg-amber-500 transition-all duration-300"
                style={{
                  width: `${maxPercentage > 0 ? (item.percentage / maxPercentage) * 100 : 0}%`,
                  minWidth: item.count > 0 ? "0.5rem" : "0",
                }}
              />
            </div>
            <span className="w-20 text-right text-xs text-gray-500">
              {item.count} ({item.percentage}%)
            </span>
          </div>
        ))}
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
git add src/app/_components/results/rating-result.tsx
git commit -m "feat: add RatingResult component with average and distribution"
```

---

### Task 3: Create the FreeTextList component

**Files:**
- Create: `src/app/_components/results/free-text-list.tsx`

- [ ] **Step 1: Create the FreeTextList component**

Create `src/app/_components/results/free-text-list.tsx`:

```tsx
type FreeTextResponse = {
  value: string;
  submittedAt: Date;
};

export function FreeTextList({
  responses,
  totalResponses,
  page,
  totalPages,
  onPageChange,
}: {
  responses: FreeTextResponse[];
  totalResponses: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalResponses === 0) {
    return (
      <div>
        <p className="text-xs text-gray-500">
          (Free Text &middot; 0 responses)
        </p>
        <p className="mt-2 text-sm text-gray-400">No responses yet.</p>
      </div>
    );
  }

  // If totalPages is 0, free text is hidden (private survey + PUBLIC results)
  if (totalPages === 0) {
    return (
      <div>
        <p className="text-xs text-gray-500">
          (Free Text &middot; {totalResponses} response
          {totalResponses !== 1 ? "s" : ""})
        </p>
        <p className="mt-2 text-sm text-gray-400">
          Individual free text responses are not displayed for this survey.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        (Free Text &middot; {totalResponses} response
        {totalResponses !== 1 ? "s" : ""})
      </p>

      <div className="space-y-3">
        {responses.map((response, index) => (
          <div
            key={`${page}-${index}`}
            className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
          >
            <p className="text-sm text-gray-800 whitespace-pre-wrap">
              {response.value}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {new Date(response.submittedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        ))}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => {
                // Show first, last, current, and neighbors
                return (
                  p === 1 ||
                  p === totalPages ||
                  Math.abs(p - page) <= 1
                );
              })
              .reduce<(number | "ellipsis")[]>((acc, p, i, arr) => {
                if (i > 0) {
                  const prev = arr[i - 1];
                  if (prev !== undefined && p - prev > 1) {
                    acc.push("ellipsis");
                  }
                }
                acc.push(p);
                return acc;
              }, [])
              .map((item, index) =>
                item === "ellipsis" ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="px-1 text-gray-400"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    onClick={() => onPageChange(item)}
                    className={`h-8 w-8 rounded-md text-sm ${
                      item === page
                        ? "bg-blue-600 font-medium text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {item}
                  </button>
                ),
              )}
          </div>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/results/free-text-list.tsx
git commit -m "feat: add FreeTextList component with pagination controls"
```

---

### Task 4: Create the QuestionResultsList component

**Files:**
- Create: `src/app/_components/results/question-results-list.tsx`

- [ ] **Step 1: Create the QuestionResultsList component**

Create `src/app/_components/results/question-results-list.tsx`:

```tsx
"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { BarChart } from "./bar-chart";
import { RatingResult } from "./rating-result";
import { FreeTextList } from "./free-text-list";

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

function FreeTextQuestionSection({
  question,
  slug,
}: {
  question: FreeTextAggregation;
  slug: string;
}) {
  const [page, setPage] = useState(question.page);

  const { data } = api.results.getQuestionAggregation.useQuery(
    { slug, questionId: question.questionId, page },
    { enabled: page !== question.page },
  );

  const currentData = (
    page === question.page ? question : data
  ) as FreeTextAggregation | undefined;

  return (
    <FreeTextList
      responses={currentData?.responses ?? question.responses}
      totalResponses={currentData?.totalResponses ?? question.totalResponses}
      page={currentData?.page ?? page}
      totalPages={currentData?.totalPages ?? question.totalPages}
      onPageChange={setPage}
    />
  );
}

function QuestionSection({
  question,
  index,
  slug,
}: {
  question: QuestionAggregation;
  index: number;
  slug: string;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-base font-semibold text-gray-900">
        {index + 1}. {question.questionText}
      </h3>
      <div className="mt-3">
        {(question.questionType === "SINGLE_SELECT" ||
          question.questionType === "MULTIPLE_CHOICE") && (
          <BarChart
            options={question.optionCounts}
            totalResponses={question.totalResponses}
            questionType={question.questionType}
          />
        )}
        {question.questionType === "RATING" && (
          <RatingResult
            average={question.average}
            distribution={question.distribution}
            totalResponses={question.totalResponses}
            minRating={question.minRating}
            maxRating={question.maxRating}
          />
        )}
        {question.questionType === "FREE_TEXT" && (
          <FreeTextQuestionSection question={question} slug={slug} />
        )}
      </div>
    </section>
  );
}

export function QuestionResultsList({
  questions,
  slug,
}: {
  questions: QuestionAggregation[];
  slug: string;
}) {
  if (questions.length === 0) {
    return (
      <p className="text-center text-sm text-gray-500">
        No questions found for this survey.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {questions.map((question, index) => (
        <QuestionSection
          key={question.questionId}
          question={question}
          index={index}
          slug={slug}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/results/question-results-list.tsx
git commit -m "feat: add QuestionResultsList with type-based visualization dispatch"
```

---

### Task 5: Create the ResultsAccessGate component

**Files:**
- Create: `src/app/_components/results/results-access-gate.tsx`

- [ ] **Step 1: Create the ResultsAccessGate component**

Create `src/app/_components/results/results-access-gate.tsx`:

```tsx
import type { ReactNode } from "react";

type AccessGateProps = {
  surveyStatus: string;
  resultsVisibility: string;
  isLoading: boolean;
  error: { message: string } | null;
  children: ReactNode;
};

export function ResultsAccessGate({
  surveyStatus,
  resultsVisibility,
  isLoading,
  error,
  children,
}: AccessGateProps) {
  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-gray-500">Loading results...</p>
      </div>
    );
  }

  if (error) {
    const message = error.message;

    if (message === "Results are not yet available") {
      return (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">
              Results Not Yet Available
            </h2>
            <p className="mt-2 text-gray-500">
              Results will be available when this survey closes.
            </p>
          </div>
        </div>
      );
    }

    if (
      message === "Only the survey creator can view these results" ||
      message ===
        "Only respondents who submitted a response can view these results"
    ) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">
              Access Denied
            </h2>
            <p className="mt-2 text-gray-500">{message}.</p>
            {resultsVisibility === "RESPONDENTS" && (
              <p className="mt-1 text-sm text-gray-400">
                Submit a response to gain access to results.
              </p>
            )}
          </div>
        </div>
      );
    }

    if (message === "You must be signed in to view these results") {
      return (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">
              Sign In Required
            </h2>
            <p className="mt-2 text-gray-500">
              Please sign in to view these results.
            </p>
          </div>
        </div>
      );
    }

    if (message === "Survey not found") {
      return (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">Not Found</h2>
            <p className="mt-2 text-gray-500">
              This survey could not be found.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Error</h2>
          <p className="mt-2 text-gray-500">
            Something went wrong loading results. Please try again.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/results/results-access-gate.tsx
git commit -m "feat: add ResultsAccessGate component for visibility checks"
```

---

### Task 6: Create the ResultsPage

**Files:**
- Create: `src/app/s/[slug]/results/page.tsx`

- [ ] **Step 1: Create the results page**

Create `src/app/s/[slug]/results/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";
import { api } from "~/trpc/react";
import { ResultsAccessGate } from "~/app/_components/results/results-access-gate";
import { QuestionResultsList } from "~/app/_components/results/question-results-list";

function ResultsHeader({
  title,
  responseCount,
  closedAt,
}: {
  title: string;
  responseCount: number;
  closedAt: Date | null;
}) {
  return (
    <div className="border-b border-gray-200 pb-6">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
        <span>
          {responseCount} response{responseCount !== 1 ? "s" : ""}
        </span>
        {closedAt && (
          <span>
            Closed{" "}
            {new Date(closedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data, isLoading, error } = api.results.getBySurvey.useQuery(
    { slug },
    { enabled: !!slug },
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <ResultsAccessGate
        surveyStatus={data?.survey.status ?? ""}
        resultsVisibility={data?.survey.resultsVisibility ?? ""}
        isLoading={isLoading}
        error={error}
      >
        {data && (
          <>
            <ResultsHeader
              title={data.survey.title}
              responseCount={data.responseCount}
              closedAt={data.survey.closedAt}
            />

            {data.responseCount === 0 ? (
              <div className="mt-12 text-center">
                <p className="text-gray-500">No responses were collected.</p>
              </div>
            ) : (
              <div className="mt-8">
                <QuestionResultsList
                  questions={data.questions}
                  slug={slug}
                />
              </div>
            )}

            {/* Navigation links */}
            <div className="mt-8 flex justify-center gap-4 border-t border-gray-200 pt-6">
              <a
                href={`/s/${slug}`}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Survey Details
              </a>
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
          </>
        )}
      </ResultsAccessGate>
    </main>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/s/\[slug\]/results/page.tsx
git commit -m "feat: add results page at /s/[slug]/results"
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
git commit -m "fix: lint and typecheck fixes for results UI"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `pnpm typecheck` passes with no errors
- [ ] `pnpm lint` passes with no errors
- [ ] BarChart component renders horizontal bars proportional to percentage, with count and percentage text for each option
- [ ] RatingResult component displays average to 1 decimal place, plus distribution bars from min to max
- [ ] FreeTextList component renders paginated list with 10 per page, handles empty state and hidden state (private survey + PUBLIC results)
- [ ] Pagination controls show first, last, current, and neighbor pages with ellipsis
- [ ] QuestionResultsList renders questions in position order, dispatches to correct visualization component
- [ ] ResultsAccessGate shows appropriate messages: "Results Not Yet Available" (PUBLISHED), "Access Denied" (wrong visibility), "Sign In Required" (unauthenticated), "Not Found"
- [ ] ResultsPage header shows survey title, response count, and close date
- [ ] "No responses were collected" shown when responseCount is 0
- [ ] FreeTextQuestionSection uses `results.getQuestionAggregation` for lazy-loaded pagination (only fetches when page changes)
- [ ] All components use Tailwind CSS for styling, no external charting libraries
