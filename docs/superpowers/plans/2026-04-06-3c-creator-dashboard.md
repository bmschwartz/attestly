# Sub-Plan 3c: Creator Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the creator dashboard with overview stats, filterable survey list, and survey actions. Protected route at `/dashboard`.

**Architecture:** Server-side page component that prefetches data via tRPC RSC caller. Client components for interactive elements (filters, sort, actions). Survey router handles all CRUD and state transitions. Dashboard uses `survey.getStats`, `survey.listMine`, `survey.create`, `survey.deleteDraft`, and `survey.close` procedures.

**Tech Stack:** Next.js 16, tRPC, Prisma 7, Tailwind CSS 4, React 19

**Spec reference:** `docs/superpowers/specs/2026-04-05-creator-dashboard-design.md`

---

## File Structure

- Modify: `src/server/api/routers/survey.ts` — survey router already exists from Plan 2a with `create`, `update`, `getForEdit`, `getBySlug`, `publish`, `deleteDraft`, `listMine`, `getStats`, `close`. All procedures needed by the dashboard already exist; no new procedures are required.
- Modify: `src/server/api/root.ts` — survey router already registered in Plan 2a; no changes needed here
- Create: `src/app/dashboard/page.tsx` — dashboard page (server component)
- Create: `src/app/dashboard/_components/overview-stats.tsx` — stat cards
- Create: `src/app/dashboard/_components/survey-list-header.tsx` — filters and new survey button
- Create: `src/app/dashboard/_components/survey-card.tsx` — status-specific survey cards
- Create: `src/app/dashboard/_components/survey-list.tsx` — filtered and sorted survey list
- Create: `src/app/dashboard/_components/empty-state.tsx` — no surveys state
- Create: `src/app/dashboard/_components/close-survey-dialog.tsx` — close confirmation dialog
- Create: `src/app/dashboard/_components/delete-draft-dialog.tsx` — delete confirmation dialog

---

### Task 1: Verify the survey router already has required procedures

**Files:**
- Verify: `src/server/api/routers/survey.ts` (already exists from Plan 2a)
- Verify: `src/server/api/root.ts` (survey router already registered from Plan 2a)

- [ ] **Step 1: Verify the survey router has all required procedures**

The survey router was created in Plan 2a and already contains all the procedures needed by the dashboard: `getStats`, `listMine`, `create`, `deleteDraft`, and `close` (plus `update`, `getForEdit`, `getBySlug`, `publish`).

Verify that `src/server/api/routers/survey.ts` exists and contains the `getStats`, `listMine`, `create`, `deleteDraft`, and `close` procedures.

No new procedures need to be added. If any are missing, refer to Plan 2a for the implementation.

- [ ] **Step 2: Verify the survey router is registered in root.ts**

Verify that `src/server/api/root.ts` imports and registers the survey router alongside any other existing routers. Do NOT replace the entire file.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && SKIP_ENV_VALIDATION=1 pnpm typecheck
```

---

### Task 2: (Skipped) Survey procedures already exist from Plan 2a

The following procedures needed by the dashboard already exist in the survey router from Plan 2a:

- `getStats` — overview stats for the creator
- `listMine` — list creator's surveys with filtering and sorting (note: Plan 2a's version uses cursor pagination; the dashboard components should use the `status` and `sort` input fields from Plan 2a's implementation)
- `create` — create a new draft survey (with free tier limit enforcement)
- `deleteDraft` — hard delete a draft survey
- `close` — close a published survey (with soft-delete of in-progress responses and email notifications)

No new procedures need to be added. Proceed directly to building the dashboard UI components.

---

### Task 3: Create the OverviewStats component

**Files:**
- Create: `src/app/dashboard/_components/overview-stats.tsx`

- [ ] **Step 1: Create the dashboard components directory**

```bash
mkdir -p /Users/bmschwartz/Development/attestly/src/app/dashboard/_components
```

- [ ] **Step 2: Create the OverviewStats component**

Create `src/app/dashboard/_components/overview-stats.tsx`:

```tsx
"use client";

import { api } from "~/trpc/react";

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900">
        {loading ? (
          <span className="inline-block h-8 w-16 animate-pulse rounded bg-gray-200" />
        ) : (
          value
        )}
      </p>
    </div>
  );
}

export function OverviewStats() {
  const { data, isLoading } = api.survey.getStats.useQuery();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Surveys"
        value={data?.totalSurveys ?? 0}
        loading={isLoading}
      />
      <StatCard
        label="Responses"
        value={data?.totalResponses ?? 0}
        loading={isLoading}
      />
      <StatCard
        label="Active"
        value={data?.activeSurveys ?? 0}
        loading={isLoading}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/app/dashboard/_components/overview-stats.tsx
git commit -m "feat: create OverviewStats component with stat cards"
```

---

### Task 4: Create the SurveyListHeader component

**Files:**
- Create: `src/app/dashboard/_components/survey-list-header.tsx`

- [ ] **Step 1: Create the SurveyListHeader component**

Create `src/app/dashboard/_components/survey-list-header.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

const STATUS_TABS = ["ALL", "DRAFT", "PUBLISHED", "CLOSED"] as const;
const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "most_responses", label: "Most responses" },
  { value: "alphabetical", label: "Alphabetical" },
] as const;

export type StatusFilter = (typeof STATUS_TABS)[number];
export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

export function SurveyListHeader({
  statusFilter,
  sortOption,
  onStatusChange,
  onSortChange,
}: {
  statusFilter: StatusFilter;
  sortOption: SortOption;
  onStatusChange: (status: StatusFilter) => void;
  onSortChange: (sort: SortOption) => void;
}) {
  const router = useRouter();
  const utils = api.useUtils();

  const createSurvey = api.survey.create.useMutation({
    onSuccess: (data) => {
      void utils.survey.getStats.invalidate();
      void utils.survey.listMine.invalidate();
      router.push(`/surveys/${data.id}/edit`);
    },
  });

  const { data: stats } = api.survey.getStats.useQuery();
  const isAtLimit = (stats?.totalSurveys ?? 0) >= 5;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Your Surveys</h2>
        <button
          onClick={() => createSurvey.mutate()}
          disabled={createSurvey.isPending || isAtLimit}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          title={
            isAtLimit
              ? "You've reached the free plan limit of 5 surveys. Upgrade for unlimited."
              : undefined
          }
        >
          {createSurvey.isPending ? "Creating..." : "+ New Survey"}
        </button>
      </div>

      {isAtLimit && (
        <p className="text-sm text-amber-600">
          You&apos;ve reached the free plan limit of 5 surveys. Upgrade for
          unlimited.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status filter tabs */}
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => onStatusChange(tab)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === tab
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab === "ALL" ? "All" : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <select
          value={sortOption}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/app/dashboard/_components/survey-list-header.tsx
git commit -m "feat: create SurveyListHeader with status filters, sort, and new survey button"
```

---

### Task 5: Create the SurveyCard component

**Files:**
- Create: `src/app/dashboard/_components/survey-card.tsx`

- [ ] **Step 1: Create the SurveyCard component**

Create `src/app/dashboard/_components/survey-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { type RouterOutputs } from "~/trpc/react";
import { DeleteDraftDialog } from "./delete-draft-dialog";
import { CloseSurveyDialog } from "./close-survey-dialog";

type Survey = RouterOutputs["survey"]["listMine"][number];

function formatDate(date: Date | null): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    PUBLISHED: "bg-green-100 text-green-700",
    CLOSED: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function DraftCard({ survey }: { survey: Survey }) {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-gray-900">{survey.title}</h3>
              <StatusBadge status="DRAFT" />
            </div>
            <div className="mt-2 flex gap-4 text-sm text-gray-500">
              <span>{survey.questionCount} questions</span>
              <span>Created {formatDate(survey.createdAt)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href={`/surveys/${survey.id}/edit`}
              className="rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-100"
            >
              Edit
            </a>
            <button
              onClick={() => setShowDelete(true)}
              className="rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
      {showDelete && (
        <DeleteDraftDialog
          surveyId={survey.id}
          onClose={() => setShowDelete(false)}
        />
      )}
    </>
  );
}

function PublishedCard({ survey }: { survey: Survey }) {
  const [showClose, setShowClose] = useState(false);
  const [copied, setCopied] = useState(false);

  const surveyUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/s/${survey.slug}`;

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(surveyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-gray-900">{survey.title}</h3>
              <StatusBadge status="PUBLISHED" />
              {survey.isPrivate && (
                <span className="text-gray-400" title="Private survey">
                  🔒
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
              <span>{survey.responseCount} responses</span>
              <span>Published {formatDate(survey.publishedAt)}</span>
              <span className="font-mono text-xs text-gray-400">
                /s/{survey.slug}
              </span>
            </div>
            {survey.accessMode === "INVITE_ONLY" && (
              <div className="mt-1 text-sm text-gray-500">
                {survey.inviteCount} invites
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/s/${survey.slug}/results`}
              className="rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-100"
            >
              View Results
            </a>
            <button
              onClick={handleCopyLink}
              className="rounded-md bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <button
              onClick={() => setShowClose(true)}
              className="rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100"
            >
              Close Survey
            </button>
          </div>
        </div>
      </div>
      {showClose && (
        <CloseSurveyDialog
          surveyId={survey.id}
          onClose={() => setShowClose(false)}
        />
      )}
    </>
  );
}

function ClosedCard({ survey }: { survey: Survey }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900">{survey.title}</h3>
            <StatusBadge status="CLOSED" />
          </div>
          <div className="mt-2 flex gap-4 text-sm text-gray-500">
            <span>{survey.responseCount} responses</span>
            <span>Closed {formatDate(survey.closedAt)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={`/s/${survey.slug}/results`}
            className="rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-100"
          >
            View Results
          </a>
        </div>
      </div>
    </div>
  );
}

export function SurveyCard({ survey }: { survey: Survey }) {
  switch (survey.status) {
    case "DRAFT":
      return <DraftCard survey={survey} />;
    case "PUBLISHED":
      return <PublishedCard survey={survey} />;
    case "CLOSED":
      return <ClosedCard survey={survey} />;
    default:
      return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/app/dashboard/_components/survey-card.tsx
git commit -m "feat: create SurveyCard component with status-specific layouts and actions"
```

---

### Task 6: Create the confirmation dialog components

**Files:**
- Create: `src/app/dashboard/_components/delete-draft-dialog.tsx`
- Create: `src/app/dashboard/_components/close-survey-dialog.tsx`

- [ ] **Step 1: Create the DeleteDraftDialog component**

Create `src/app/dashboard/_components/delete-draft-dialog.tsx`:

```tsx
"use client";

import { api } from "~/trpc/react";

export function DeleteDraftDialog({
  surveyId,
  onClose,
}: {
  surveyId: string;
  onClose: () => void;
}) {
  const utils = api.useUtils();

  const deleteDraft = api.survey.deleteDraft.useMutation({
    onSuccess: () => {
      void utils.survey.listMine.invalidate();
      void utils.survey.getStats.invalidate();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">
          Delete this draft?
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          This cannot be undone. The survey and all its questions will be
          permanently deleted.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={() => deleteDraft.mutate({ surveyId })}
            disabled={deleteDraft.isPending}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleteDraft.isPending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the CloseSurveyDialog component**

Create `src/app/dashboard/_components/close-survey-dialog.tsx`:

```tsx
"use client";

import { api } from "~/trpc/react";

export function CloseSurveyDialog({
  surveyId,
  onClose,
}: {
  surveyId: string;
  onClose: () => void;
}) {
  const utils = api.useUtils();

  const closeSurvey = api.survey.close.useMutation({
    onSuccess: () => {
      void utils.survey.listMine.invalidate();
      void utils.survey.getStats.invalidate();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">
          Close this survey?
        </h3>
        <div className="mt-2 space-y-2 text-sm text-gray-600">
          <p>Closing a survey will:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Stop accepting new responses immediately</li>
            <li>Discard any in-progress (incomplete) responses</li>
            <li>
              Notify all respondents who submitted a response via email
            </li>
          </ul>
          <p className="font-medium text-gray-700">
            This action cannot be undone.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={() => closeSurvey.mutate({ surveyId })}
            disabled={closeSurvey.isPending}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {closeSurvey.isPending ? "Closing..." : "Close Survey"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/app/dashboard/_components/delete-draft-dialog.tsx src/app/dashboard/_components/close-survey-dialog.tsx
git commit -m "feat: create DeleteDraftDialog and CloseSurveyDialog components"
```

---

### Task 7: Create the EmptyState component

**Files:**
- Create: `src/app/dashboard/_components/empty-state.tsx`

- [ ] **Step 1: Create the EmptyState component**

Create `src/app/dashboard/_components/empty-state.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

export function EmptyState() {
  const router = useRouter();
  const utils = api.useUtils();

  const createSurvey = api.survey.create.useMutation({
    onSuccess: (data) => {
      void utils.survey.getStats.invalidate();
      void utils.survey.listMine.invalidate();
      router.push(`/surveys/${data.id}/edit`);
    },
  });

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-16">
      <p className="text-lg text-gray-500">
        You haven&apos;t created any surveys yet.
      </p>
      <button
        onClick={() => createSurvey.mutate()}
        disabled={createSurvey.isPending}
        className="mt-4 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {createSurvey.isPending
          ? "Creating..."
          : "Create Your First Survey"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/app/dashboard/_components/empty-state.tsx
git commit -m "feat: create EmptyState component for empty dashboard"
```

---

### Task 8: Create the SurveyList component

**Files:**
- Create: `src/app/dashboard/_components/survey-list.tsx`

- [ ] **Step 1: Create the SurveyList component**

Create `src/app/dashboard/_components/survey-list.tsx`:

```tsx
"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { OverviewStats } from "./overview-stats";
import {
  SurveyListHeader,
  type StatusFilter,
  type SortOption,
} from "./survey-list-header";
import { SurveyCard } from "./survey-card";
import { EmptyState } from "./empty-state";

export function SurveyList() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortOption, setSortOption] = useState<SortOption>("newest");

  const { data: stats } = api.survey.getStats.useQuery();
  const { data: surveys, isLoading } = api.survey.listMine.useQuery({
    status: statusFilter,
    sort: sortOption,
  });

  const hasNoSurveys = !isLoading && (stats?.totalSurveys ?? 0) === 0;

  return (
    <div className="space-y-6">
      <OverviewStats />

      {hasNoSurveys ? (
        <EmptyState />
      ) : (
        <>
          <SurveyListHeader
            statusFilter={statusFilter}
            sortOption={sortOption}
            onStatusChange={setStatusFilter}
            onSortChange={setSortOption}
          />

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-lg bg-gray-100"
                />
              ))}
            </div>
          ) : surveys && surveys.length > 0 ? (
            <div className="space-y-4">
              {surveys.map((survey) => (
                <SurveyCard key={survey.id} survey={survey} />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-gray-500">
              No surveys match the current filter.
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/app/dashboard/_components/survey-list.tsx
git commit -m "feat: create SurveyList component with filtering and sorting"
```

---

### Task 9: Create the DashboardPage

**Files:**
- Create: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Create the dashboard directory**

```bash
mkdir -p /Users/bmschwartz/Development/attestly/src/app/dashboard
```

- [ ] **Step 2: Create the DashboardPage**

Create `src/app/dashboard/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { api } from "~/trpc/server";
import { SurveyList } from "./_components/survey-list";

export const metadata = {
  title: "Dashboard | Attestly",
};

export default async function DashboardPage() {
  // Prefetch data for the dashboard on the server.
  // If this throws UNAUTHORIZED, the user is not logged in.
  try {
    await api.survey.getStats.prefetch();
    await api.survey.listMine.prefetch({ status: "ALL", sort: "newest" });
  } catch {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>
      <SurveyList />
    </main>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && SKIP_ENV_VALIDATION=1 pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/app/dashboard/
git commit -m "feat: create DashboardPage with prefetched stats and survey list"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `SKIP_ENV_VALIDATION=1 pnpm typecheck` — no TypeScript errors
- [ ] `pnpm lint` — no lint errors
- [ ] Survey router (from Plan 2a) has all required procedures: `getStats`, `listMine`, `create`, `deleteDraft`, `close`
- [ ] Survey router is registered in `src/server/api/root.ts` (from Plan 2a)
- [ ] `/dashboard` page exists and renders server-side
- [ ] OverviewStats shows 3 stat cards
- [ ] SurveyListHeader has status filter tabs and sort dropdown
- [ ] SurveyCard renders different layouts for DRAFT/PUBLISHED/CLOSED
- [ ] EmptyState shows when no surveys exist
- [ ] DeleteDraftDialog and CloseSurveyDialog have confirmation flows
- [ ] Free tier limit (5 surveys) is enforced on create
