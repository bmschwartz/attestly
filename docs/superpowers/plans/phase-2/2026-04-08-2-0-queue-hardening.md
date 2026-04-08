# Sub-Plan 2-0: Job Queue Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs in the existing job queue before Phase 2 blockchain handlers run. Both bugs cause `retryCount` to increment in cases where no actual job failure occurred, silently exhausting the retry budget.

**Why now:** These bugs affect all job types including the existing `GENERATE_AI_SUMMARY` handler. Phase 2 adds dependency-blocked jobs (SUBMIT_RESPONSE waiting for PUBLISH_SURVEY) which would be permanently killed by these bugs after 3 false failures.

**Tech Stack:** Prisma 7, PostgreSQL, existing job queue (`src/server/jobs/`)

**Depends on:** Nothing — pure queue fix, no Phase 2 dependencies.

---

## The Three Issues

### Bug 1: Backoff path burns retry count

In `worker.ts`, when `!isReadyForRetry`, the worker calls `failJob` — which increments `retryCount`. A job checked 3 times while in backoff is permanently marked FAILED despite never having attempted execution. With `MAX_RETRIES = 3` and backoff delays of 5s/30s/300s, a job that is claimed 3 times before its backoff window expires is destroyed.

### Bug 2: No deferred-release path

There is no way to release a job back to PENDING without incrementing `retryCount`. Phase 2 needs this for dependency-blocked jobs (deps not met → release, try again later). Without it, a SUBMIT_RESPONSE job blocked on a slow PUBLISH_SURVEY would exhaust all retries before the publish completes.

### Issue 3: Global MAX_RETRIES is too low for blockchain jobs

`MAX_RETRIES = 3` with backoff [5s, 30s, 300s] gives ~6 minutes. An IPFS or RPC outage lasting longer permanently fails the job — the creator's signature is burned, and they must re-sign. Blockchain jobs need a larger retry budget (~50 minutes) since external service outages are common and the cost of permanent failure is high (user notification + re-sign flow).

---

## Fix

1. Add a `nextAttemptAt` field to `BackgroundJob` and a `releaseJob` function that defers without incrementing `retryCount`. Update `claimNextJob` to respect the deferral. Fix the backoff path to use `releaseJob` instead of `failJob`.
2. Make retry budget per-job-type: blockchain jobs get 10 retries with an extended backoff tail.

---

## File Structure

- Modify: `prisma/schema.prisma` — add `nextAttemptAt DateTime?` to `BackgroundJob`
- Modify: `src/server/jobs/queue.ts` — add `releaseJob`, update `claimNextJob`
- Modify: `src/server/jobs/worker.ts` — fix backoff path

---

### Task 1: Add `nextAttemptAt` to BackgroundJob schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add field to BackgroundJob model**

```prisma
model BackgroundJob {
  // ... existing fields ...
  nextAttemptAt   DateTime?  // null = ready immediately; set by releaseJob for deferral
}
```

- [ ] **Step 2: Run migration**

```bash
pnpm prisma migrate dev --name add_background_job_next_attempt_at
```

- [ ] **Step 3: Verify Prisma client regenerated**

```bash
pnpm prisma generate
```

---

### Task 2: Add `releaseJob` and update `claimNextJob` in queue.ts

**Files:**
- Modify: `src/server/jobs/queue.ts`

- [ ] **Step 1: Update `claimNextJob` to filter by `nextAttemptAt`**

The current WHERE clause only filters `status: "PENDING"`. Add a time filter so deferred jobs are skipped until their deferral window expires:

```typescript
export async function claimNextJob(jobTypes?: JobType[]) {
  const now = new Date();
  const pendingJob = await db.backgroundJob.findFirst({
    where: {
      status: "PENDING",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      ...(jobTypes ? { type: { in: jobTypes } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  // ... rest unchanged ...
}
```

- [ ] **Step 2: Add `releaseJob` function**

```typescript
/**
 * Release a job back to PENDING without incrementing retryCount.
 * Use for:
 * - Backoff not yet elapsed (job was claimed but not ready)
 * - Dependency not yet met (dep-blocked, try again after delay)
 *
 * @param jobId   The job to release
 * @param delayMs How long to defer before the job is eligible again (default: 0)
 */
export async function releaseJob(jobId: string, delayMs = 0): Promise<void> {
  const nextAttemptAt = delayMs > 0 ? new Date(Date.now() + delayMs) : null;
  await db.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "PENDING",
      nextAttemptAt,
    },
  });
}
```

Export it alongside the other queue functions.

---

### Task 3: Fix backoff path in worker.ts

**Files:**
- Modify: `src/server/jobs/worker.ts`

- [ ] **Step 1: Import `releaseJob` alongside existing imports**

```typescript
import { claimNextJob, completeJob, failJob, releaseJob, isReadyForRetry } from "./queue";
```

- [ ] **Step 2: Replace `failJob` with `releaseJob` in the backoff path**

Current (buggy):
```typescript
if (!isReadyForRetry(job.retryCount, job.lastAttemptedAt)) {
  await failJob(job.id, job.error ?? "Backoff not elapsed");
  return false;
}
```

Fixed:
```typescript
if (!isReadyForRetry(job.retryCount, job.lastAttemptedAt)) {
  // Not ready yet — release without burning retry count.
  // Defer by the remaining backoff window so we don't re-claim immediately.
  const delay = getRetryDelay(job.retryCount);
  await releaseJob(job.id, delay);
  return false;
}
```

Also import `getRetryDelay` from `./queue`.

---

### Task 3b: Per-job-type retry budget

**Files:**
- Modify: `src/server/jobs/queue.ts`

- [ ] **Step 1: Replace global MAX_RETRIES with a per-type lookup**

```typescript
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_MS = [5_000, 30_000, 300_000] as const;

// Blockchain jobs get extended retry budget (~50 minutes total)
const BLOCKCHAIN_MAX_RETRIES = 10;
const BLOCKCHAIN_BACKOFF_MS = [
  5_000,    // 5s
  15_000,   // 15s
  30_000,   // 30s
  60_000,   // 1m
  120_000,  // 2m
  300_000,  // 5m
  600_000,  // 10m
  1_800_000, // 30m
] as const;

const BLOCKCHAIN_JOB_TYPES: Set<string> = new Set([
  "PUBLISH_SURVEY",
  "SUBMIT_RESPONSE",
  "CLOSE_SURVEY",
]);

export function getMaxRetries(jobType: string): number {
  return BLOCKCHAIN_JOB_TYPES.has(jobType) ? BLOCKCHAIN_MAX_RETRIES : DEFAULT_MAX_RETRIES;
}

export function getRetryDelay(retryCount: number, jobType?: string): number {
  if (retryCount <= 0) return 0;
  const schedule = (jobType && BLOCKCHAIN_JOB_TYPES.has(jobType))
    ? BLOCKCHAIN_BACKOFF_MS
    : DEFAULT_BACKOFF_MS;
  const index = Math.min(retryCount - 1, schedule.length - 1);
  return schedule[index]!;
}
```

- [ ] **Step 2: Update `failJob` to use per-type max retries**

```typescript
export async function failJob(jobId: string, errorMessage: string) {
  const job = await db.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Job ${jobId} not found`);

  const nextRetryCount = job.retryCount + 1;
  const maxRetries = getMaxRetries(job.type);

  if (nextRetryCount >= maxRetries) {
    return db.backgroundJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: errorMessage, retryCount: nextRetryCount },
    });
  }

  return db.backgroundJob.update({
    where: { id: jobId },
    data: { status: "PENDING", error: errorMessage, retryCount: nextRetryCount },
  });
}
```

- [ ] **Step 3: Update `isReadyForRetry` to pass job type through**

```typescript
export function isReadyForRetry(retryCount: number, lastAttemptedAt: Date | null, jobType?: string): boolean {
  if (retryCount === 0) return true;
  if (!lastAttemptedAt) return true;
  const delay = getRetryDelay(retryCount, jobType);
  const readyAt = new Date(lastAttemptedAt.getTime() + delay);
  return new Date() >= readyAt;
}
```

Update the worker call site to pass `job.type` to `isReadyForRetry`.

---

### Task 4: Typecheck and verify

- [ ] **Step 1: Run `pnpm typecheck`** — no TypeScript errors

- [ ] **Step 2: Run `pnpm test`** — all existing tests pass

- [ ] **Step 3: Smoke test**

Manually verify that:
- A PENDING job with `nextAttemptAt` in the future is not claimed
- A PENDING job with `nextAttemptAt` in the past IS claimed
- A job released via `releaseJob` does not have an incremented `retryCount`

---

## Verification Checklist

- [ ] `pnpm typecheck` — no errors
- [ ] `pnpm test` — all tests pass
- [ ] `prisma/schema.prisma` — `BackgroundJob` has `nextAttemptAt DateTime?`
- [ ] `claimNextJob` filters `nextAttemptAt: null OR lte: now`
- [ ] `releaseJob(jobId, delayMs?)` exported from `queue.ts` — sets PENDING + nextAttemptAt, never touches retryCount
- [ ] Worker backoff path uses `releaseJob(job.id, delay)` instead of `failJob`
- [ ] `failJob` is still used only for actual execution failures (handler throws)
- [ ] `getMaxRetries("PUBLISH_SURVEY")` returns 10; `getMaxRetries("SEND_EMAIL")` returns 3
- [ ] `getRetryDelay(8, "PUBLISH_SURVEY")` returns 1,800,000 (30 min); `getRetryDelay(3, "SEND_EMAIL")` returns 300,000 (5 min)
- [ ] Worker passes `job.type` to `isReadyForRetry` and `getRetryDelay`
