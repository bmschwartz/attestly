# Sub-Plan 4a: Background Job Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Postgres-backed background job queue for async operations (email delivery, AI summary generation, blockchain transactions), with atomic claim, retry logic, stale job detection, and a pluggable handler registry.

**Architecture:** The job queue uses the existing BackgroundJob Prisma model as its backing store. A queue service provides functions to enqueue, claim (atomic PENDING->PROCESSING via `updateMany` with status filter), complete, and fail jobs. A standalone worker process polls the database at a configurable interval, claims pending jobs, and dispatches them to registered handler functions. Retry logic uses exponential backoff (5s, 30s, 5min) with a max of 3 retries. Stale jobs (PROCESSING for >60 minutes) are automatically reset to PENDING.

**Tech Stack:** Prisma 7, PostgreSQL, TypeScript, Node.js

**Spec reference:** `docs/superpowers/specs/2026-04-04-data-model-design.md` (BackgroundJob entity)

---

## File Structure

- Create: `src/server/jobs/queue.ts` — queue service (enqueue, claim, complete, fail, retry, stale detection)
- Create: `src/server/jobs/handlers.ts` — job type handler registry with placeholder handlers
- Create: `src/server/jobs/worker.ts` — polling worker loop with graceful shutdown
- Create: `src/server/jobs/start-worker.ts` — development entry point for starting the worker
- Create: `src/server/jobs/__tests__/queue.test.ts` — tests for queue service
- Create: `src/server/jobs/__tests__/worker.test.ts` — tests for worker
- Modify: `package.json` — add "worker" script

---

### Task 1: Create the job queue service

**Files:**
- Create: `src/server/jobs/queue.ts`

- [ ] **Step 1: Create the queue service with all core functions**

Create `src/server/jobs/queue.ts`:

```typescript
import { db } from "~/server/db";
import type { JobType, JobStatus } from "../../../generated/prisma";

/** Backoff schedule in milliseconds for retries: 5s, 30s, 5min */
const RETRY_BACKOFF_MS = [5_000, 30_000, 300_000] as const;

/** Maximum number of retry attempts before marking as FAILED */
const MAX_RETRIES = 3;

/** Jobs processing longer than this are considered stale (in minutes) */
const STALE_JOB_TIMEOUT_MINUTES = 60;

export interface CreateJobInput {
  type: JobType;
  surveyId?: string;
  responseId?: string;
  payload?: Record<string, unknown>;
}

/**
 * Enqueue a new background job. Returns the created job record.
 * The BackgroundJob_dedup partial unique index prevents duplicate
 * PENDING/PROCESSING jobs for the same (type, surveyId, responseId).
 */
export async function createJob(input: CreateJobInput) {
  return db.backgroundJob.create({
    data: {
      type: input.type,
      status: "PENDING",
      surveyId: input.surveyId ?? null,
      responseId: input.responseId ?? null,
      payload: input.payload ?? {},
      retryCount: 0,
    },
  });
}

/**
 * Atomically claim the next PENDING job of the given types.
 * Uses updateMany with a status filter to ensure only one worker
 * can claim a job (compare-and-swap pattern via Prisma).
 *
 * Returns the claimed job, or null if no jobs are available.
 */
export async function claimNextJob(jobTypes?: JobType[]) {
  // Find the oldest pending job
  const pendingJob = await db.backgroundJob.findFirst({
    where: {
      status: "PENDING",
      ...(jobTypes ? { type: { in: jobTypes } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  if (!pendingJob) return null;

  // Atomically set status to PROCESSING only if still PENDING
  const updated = await db.backgroundJob.updateMany({
    where: {
      id: pendingJob.id,
      status: "PENDING",
    },
    data: {
      status: "PROCESSING",
      lastAttemptedAt: new Date(),
    },
  });

  // If count is 0, another worker claimed it first — try again
  if (updated.count === 0) return claimNextJob(jobTypes);

  // Return the full job record
  return db.backgroundJob.findUnique({ where: { id: pendingJob.id } });
}

/**
 * Mark a job as COMPLETED.
 */
export async function completeJob(jobId: string) {
  return db.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
    },
  });
}

/**
 * Mark a job as failed. If retries remain, schedule for retry by
 * setting status back to PENDING. On final failure, set FAILED.
 */
export async function failJob(jobId: string, errorMessage: string) {
  const job = await db.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Job ${jobId} not found`);

  const nextRetryCount = job.retryCount + 1;

  if (nextRetryCount >= MAX_RETRIES) {
    // Final failure — no more retries
    return db.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        error: errorMessage,
        retryCount: nextRetryCount,
      },
    });
  }

  // Schedule retry — set back to PENDING with incremented retry count
  return db.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "PENDING",
      error: errorMessage,
      retryCount: nextRetryCount,
    },
  });
}

/**
 * Get the backoff delay in milliseconds for the given retry count.
 * Returns 0 for the first attempt (no delay).
 */
export function getRetryDelay(retryCount: number): number {
  if (retryCount <= 0) return 0;
  const index = Math.min(retryCount - 1, RETRY_BACKOFF_MS.length - 1);
  return RETRY_BACKOFF_MS[index]!;
}

/**
 * Check if a job should be retried now based on its retry count
 * and lastAttemptedAt timestamp (exponential backoff).
 */
export function isReadyForRetry(
  retryCount: number,
  lastAttemptedAt: Date | null,
): boolean {
  if (retryCount === 0) return true;
  if (!lastAttemptedAt) return true;

  const delay = getRetryDelay(retryCount);
  const readyAt = new Date(lastAttemptedAt.getTime() + delay);
  return new Date() >= readyAt;
}

/**
 * Detect and reset stale jobs. Jobs with status PROCESSING and
 * lastAttemptedAt older than STALE_JOB_TIMEOUT_MINUTES are reset
 * to PENDING for automatic retry.
 *
 * Returns the count of reset jobs.
 */
export async function resetStaleJobs(): Promise<number> {
  const cutoff = new Date(
    Date.now() - STALE_JOB_TIMEOUT_MINUTES * 60 * 1000,
  );

  const result = await db.backgroundJob.updateMany({
    where: {
      status: "PROCESSING",
      lastAttemptedAt: { lt: cutoff },
    },
    data: {
      status: "PENDING",
      error: "Job timed out (stale detection reset)",
    },
  });

  if (result.count > 0) {
    console.log(`[JobQueue] Reset ${result.count} stale job(s) to PENDING`);
  }

  return result.count;
}

export { MAX_RETRIES, RETRY_BACKOFF_MS, STALE_JOB_TIMEOUT_MINUTES };
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

Expected: no errors related to `src/server/jobs/queue.ts`

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/jobs/queue.ts
git commit -m "feat: add background job queue service with enqueue, claim, complete, fail, retry"
```

---

### Task 2: Create the job handler registry

**Files:**
- Create: `src/server/jobs/handlers.ts`

- [ ] **Step 1: Create the handler registry with placeholder handlers**

Create `src/server/jobs/handlers.ts`:

```typescript
import type { BackgroundJob } from "../../../generated/prisma";

/**
 * A job handler function. Receives the full job record and performs
 * the job-specific work. Should throw on failure (the worker will
 * call failJob with the error message).
 */
export type JobHandler = (job: BackgroundJob) => Promise<void>;

/**
 * Registry mapping JobType to handler functions.
 * Handlers for SEND_EMAIL and GENERATE_AI_SUMMARY will be
 * registered by their respective sub-plans (3d and 4b).
 */
const handlers = new Map<string, JobHandler>();

/**
 * Register a handler for a job type. Overwrites any existing handler.
 */
export function registerHandler(jobType: string, handler: JobHandler) {
  handlers.set(jobType, handler);
}

/**
 * Get the handler for a job type. Returns undefined if no handler is registered.
 */
export function getHandler(jobType: string): JobHandler | undefined {
  return handlers.get(jobType);
}

/**
 * Check if a handler is registered for a job type.
 */
export function hasHandler(jobType: string): boolean {
  return handlers.has(jobType);
}

// --- Placeholder handlers ---
// These log and complete immediately. Real handlers will be registered
// by their respective sub-plans.

const placeholderHandler =
  (typeName: string): JobHandler =>
  async (job) => {
    console.log(
      `[JobHandler] Placeholder handler for ${typeName} — job ${job.id}`,
    );
    console.log(`[JobHandler] Payload:`, job.payload);
  };

// Register placeholder handlers for all job types
registerHandler("PUBLISH_SURVEY", placeholderHandler("PUBLISH_SURVEY"));
registerHandler("SUBMIT_RESPONSE", placeholderHandler("SUBMIT_RESPONSE"));
registerHandler("CLOSE_SURVEY", placeholderHandler("CLOSE_SURVEY"));
registerHandler("VERIFY_RESPONSES", placeholderHandler("VERIFY_RESPONSES"));
registerHandler("SEND_EMAIL", placeholderHandler("SEND_EMAIL"));
registerHandler(
  "GENERATE_AI_SUMMARY",
  placeholderHandler("GENERATE_AI_SUMMARY"),
);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/jobs/handlers.ts
git commit -m "feat: add job handler registry with placeholder handlers"
```

---

### Task 3: Create the worker polling loop

**Files:**
- Create: `src/server/jobs/worker.ts`

- [ ] **Step 1: Create the worker with polling loop and graceful shutdown**

Create `src/server/jobs/worker.ts`:

```typescript
import { claimNextJob, completeJob, failJob, resetStaleJobs, isReadyForRetry } from "./queue";
import { getHandler } from "./handlers";

/** Default poll interval in milliseconds */
const DEFAULT_POLL_INTERVAL_MS = 5_000;

/** How often to check for stale jobs (every 5 minutes) */
const STALE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export interface WorkerOptions {
  /** Poll interval in milliseconds. Default: 5000 */
  pollIntervalMs?: number;
  /** If set, only process jobs of these types */
  jobTypes?: string[];
}

/**
 * Creates and starts a background job worker that polls the database
 * for pending jobs, claims them, and dispatches to registered handlers.
 *
 * Returns a stop function for graceful shutdown.
 */
export function startWorker(options: WorkerOptions = {}): {
  stop: () => void;
} {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  let isRunning = true;
  let pollTimeout: ReturnType<typeof setTimeout> | null = null;
  let staleCheckTimeout: ReturnType<typeof setTimeout> | null = null;

  console.log("[Worker] Starting background job worker");
  console.log(`[Worker] Poll interval: ${pollIntervalMs}ms`);
  if (options.jobTypes) {
    console.log(`[Worker] Filtering job types: ${options.jobTypes.join(", ")}`);
  }

  async function processNextJob(): Promise<boolean> {
    try {
      const job = await claimNextJob(
        options.jobTypes as import("../../../generated/prisma").JobType[] | undefined,
      );

      if (!job) return false;

      // Check if the job is ready for retry (respects backoff)
      if (!isReadyForRetry(job.retryCount, job.lastAttemptedAt)) {
        // Not ready yet — release back to PENDING
        // (it was just claimed, so set it back)
        await failJob(job.id, job.error ?? "Backoff not elapsed");
        return false;
      }

      const handler = getHandler(job.type);

      if (!handler) {
        console.warn(`[Worker] No handler registered for job type: ${job.type}`);
        await failJob(job.id, `No handler registered for job type: ${job.type}`);
        return true;
      }

      console.log(
        `[Worker] Processing job ${job.id} (type: ${job.type}, attempt: ${job.retryCount + 1})`,
      );

      try {
        await handler(job);
        await completeJob(job.id);
        console.log(`[Worker] Completed job ${job.id}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`[Worker] Job ${job.id} failed: ${errorMessage}`);
        await failJob(job.id, errorMessage);
      }

      return true;
    } catch (error) {
      console.error("[Worker] Error in processNextJob:", error);
      return false;
    }
  }

  async function poll() {
    if (!isRunning) return;

    // Process jobs until none are available
    let processed = true;
    while (processed && isRunning) {
      processed = await processNextJob();
    }

    // Schedule next poll
    if (isRunning) {
      pollTimeout = setTimeout(poll, pollIntervalMs);
    }
  }

  async function checkStaleJobs() {
    if (!isRunning) return;

    try {
      await resetStaleJobs();
    } catch (error) {
      console.error("[Worker] Error checking stale jobs:", error);
    }

    if (isRunning) {
      staleCheckTimeout = setTimeout(checkStaleJobs, STALE_CHECK_INTERVAL_MS);
    }
  }

  // Start polling and stale job detection
  void poll();
  void checkStaleJobs();

  function stop() {
    console.log("[Worker] Stopping background job worker...");
    isRunning = false;

    if (pollTimeout) {
      clearTimeout(pollTimeout);
      pollTimeout = null;
    }

    if (staleCheckTimeout) {
      clearTimeout(staleCheckTimeout);
      staleCheckTimeout = null;
    }

    console.log("[Worker] Worker stopped");
  }

  return { stop };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/jobs/worker.ts
git commit -m "feat: add background job worker with polling loop and graceful shutdown"
```

---

### Task 4: Create the worker entry point and package.json script

**Files:**
- Create: `src/server/jobs/start-worker.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the worker entry point**

Create `src/server/jobs/start-worker.ts`:

```typescript
/**
 * Entry point for the background job worker process.
 * Run with: pnpm worker
 *
 * This runs as a standalone Node.js process, separate from the
 * Next.js server. It polls the database for pending jobs and
 * processes them.
 */

// Load environment variables
import "dotenv/config";

// Import handlers to register them
import "./handlers";

import { startWorker } from "./worker";

const worker = startWorker({
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS) || 5_000,
});

// Graceful shutdown on SIGINT (Ctrl+C) and SIGTERM
process.on("SIGINT", () => {
  console.log("\n[Worker] Received SIGINT");
  worker.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[Worker] Received SIGTERM");
  worker.stop();
  process.exit(0);
});

console.log("[Worker] Background job worker is running. Press Ctrl+C to stop.");
```

- [ ] **Step 2: Add the worker script to package.json**

Add to the `scripts` section in `package.json`:

```json
"worker": "tsx src/server/jobs/start-worker.ts"
```

- [ ] **Step 3: Verify the worker starts (and stop it immediately)**

```bash
cd /Users/bmschwartz/Development/attestly && timeout 5 pnpm worker || true
```

Expected: worker starts, prints startup messages, then exits after timeout. No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/jobs/start-worker.ts package.json
git commit -m "feat: add worker entry point and pnpm worker script"
```

---

### Task 5: Create an index file for clean imports

**Files:**
- Create: `src/server/jobs/index.ts`

- [ ] **Step 1: Create the barrel export**

Create `src/server/jobs/index.ts`:

```typescript
export {
  createJob,
  claimNextJob,
  completeJob,
  failJob,
  resetStaleJobs,
  getRetryDelay,
  isReadyForRetry,
  MAX_RETRIES,
  RETRY_BACKOFF_MS,
  STALE_JOB_TIMEOUT_MINUTES,
} from "./queue";

export type { CreateJobInput } from "./queue";

export {
  registerHandler,
  getHandler,
  hasHandler,
} from "./handlers";

export type { JobHandler } from "./handlers";

export { startWorker } from "./worker";
export type { WorkerOptions } from "./worker";
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/jobs/index.ts
git commit -m "feat: add barrel export for job queue module"
```

---

### Task 6: Write tests for the queue service

**Files:**
- Create: `src/server/jobs/__tests__/queue.test.ts`

- [ ] **Step 1: Install vitest if not already installed**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm add -D vitest
```

- [ ] **Step 2: Add vitest config if not present**

Create `vitest.config.ts` at the project root (if it does not already exist):

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 3: Add test script to package.json**

Add to the `scripts` section in `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create the queue service tests**

Create `src/server/jobs/__tests__/queue.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getRetryDelay,
  isReadyForRetry,
  MAX_RETRIES,
  RETRY_BACKOFF_MS,
  STALE_JOB_TIMEOUT_MINUTES,
} from "../queue";

describe("getRetryDelay", () => {
  it("returns 0 for first attempt (retryCount 0)", () => {
    expect(getRetryDelay(0)).toBe(0);
  });

  it("returns 5s for first retry", () => {
    expect(getRetryDelay(1)).toBe(5_000);
  });

  it("returns 30s for second retry", () => {
    expect(getRetryDelay(2)).toBe(30_000);
  });

  it("returns 5min for third retry", () => {
    expect(getRetryDelay(3)).toBe(300_000);
  });

  it("caps at max backoff for retries beyond the schedule", () => {
    expect(getRetryDelay(10)).toBe(300_000);
  });

  it("returns 0 for negative retry count", () => {
    expect(getRetryDelay(-1)).toBe(0);
  });
});

describe("isReadyForRetry", () => {
  it("returns true for first attempt (retryCount 0)", () => {
    expect(isReadyForRetry(0, null)).toBe(true);
  });

  it("returns true when no lastAttemptedAt is set", () => {
    expect(isReadyForRetry(1, null)).toBe(true);
  });

  it("returns false when backoff has not elapsed", () => {
    const now = new Date();
    // First retry backoff is 5s, set lastAttemptedAt to 1s ago
    const oneSecondAgo = new Date(now.getTime() - 1_000);
    expect(isReadyForRetry(1, oneSecondAgo)).toBe(false);
  });

  it("returns true when backoff has elapsed", () => {
    const now = new Date();
    // First retry backoff is 5s, set lastAttemptedAt to 10s ago
    const tenSecondsAgo = new Date(now.getTime() - 10_000);
    expect(isReadyForRetry(1, tenSecondsAgo)).toBe(true);
  });

  it("respects second retry backoff (30s)", () => {
    const now = new Date();
    const twentySecondsAgo = new Date(now.getTime() - 20_000);
    expect(isReadyForRetry(2, twentySecondsAgo)).toBe(false);

    const fortySecondsAgo = new Date(now.getTime() - 40_000);
    expect(isReadyForRetry(2, fortySecondsAgo)).toBe(true);
  });

  it("respects third retry backoff (5min)", () => {
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
    expect(isReadyForRetry(3, twoMinutesAgo)).toBe(false);

    const sixMinutesAgo = new Date(now.getTime() - 6 * 60 * 1000);
    expect(isReadyForRetry(3, sixMinutesAgo)).toBe(true);
  });
});

describe("constants", () => {
  it("MAX_RETRIES is 3", () => {
    expect(MAX_RETRIES).toBe(3);
  });

  it("RETRY_BACKOFF_MS has 3 entries", () => {
    expect(RETRY_BACKOFF_MS).toHaveLength(3);
    expect(RETRY_BACKOFF_MS[0]).toBe(5_000);
    expect(RETRY_BACKOFF_MS[1]).toBe(30_000);
    expect(RETRY_BACKOFF_MS[2]).toBe(300_000);
  });

  it("STALE_JOB_TIMEOUT_MINUTES is 60", () => {
    expect(STALE_JOB_TIMEOUT_MINUTES).toBe(60);
  });
});
```

- [ ] **Step 5: Create handler registry tests**

Create `src/server/jobs/__tests__/handlers.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { registerHandler, getHandler, hasHandler } from "../handlers";
import type { BackgroundJob } from "../../../../generated/prisma";

describe("handler registry", () => {
  it("registers and retrieves a handler", () => {
    const handler = vi.fn();
    registerHandler("TEST_TYPE", handler);
    expect(getHandler("TEST_TYPE")).toBe(handler);
  });

  it("returns undefined for unregistered type", () => {
    expect(getHandler("NONEXISTENT_TYPE")).toBeUndefined();
  });

  it("hasHandler returns true for registered types", () => {
    expect(hasHandler("SEND_EMAIL")).toBe(true);
    expect(hasHandler("GENERATE_AI_SUMMARY")).toBe(true);
  });

  it("hasHandler returns false for unregistered types", () => {
    expect(hasHandler("DOES_NOT_EXIST")).toBe(false);
  });

  it("overwrites existing handler on re-register", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    registerHandler("OVERWRITE_TEST", handler1);
    registerHandler("OVERWRITE_TEST", handler2);
    expect(getHandler("OVERWRITE_TEST")).toBe(handler2);
  });

  it("all 6 placeholder handlers are registered", () => {
    const jobTypes = [
      "PUBLISH_SURVEY",
      "SUBMIT_RESPONSE",
      "CLOSE_SURVEY",
      "VERIFY_RESPONSES",
      "SEND_EMAIL",
      "GENERATE_AI_SUMMARY",
    ];
    for (const type of jobTypes) {
      expect(hasHandler(type)).toBe(true);
      expect(getHandler(type)).toBeTypeOf("function");
    }
  });
});
```

- [ ] **Step 6: Run the tests**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm test
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/jobs/__tests__/ vitest.config.ts package.json pnpm-lock.yaml
git commit -m "test: add unit tests for job queue service and handler registry"
```

---

### Task 7: Verify end-to-end with a manual smoke test

- [ ] **Step 1: Verify typecheck passes**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm typecheck
```

Expected: no errors

- [ ] **Step 2: Verify all tests pass**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm test
```

Expected: all tests pass

- [ ] **Step 3: Verify the worker starts**

```bash
cd /Users/bmschwartz/Development/attestly && timeout 3 pnpm worker || true
```

Expected: worker starts successfully, prints startup messages, exits after timeout

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `pnpm typecheck` — no TypeScript errors
- [ ] `pnpm test` — all queue and handler tests pass
- [ ] `pnpm worker` — starts and polls without errors (Ctrl+C to stop)
- [ ] `src/server/jobs/queue.ts` — has createJob, claimNextJob, completeJob, failJob, resetStaleJobs
- [ ] `src/server/jobs/handlers.ts` — has registerHandler, getHandler, hasHandler, all 6 placeholder handlers
- [ ] `src/server/jobs/worker.ts` — has startWorker with polling loop and graceful shutdown
- [ ] `src/server/jobs/start-worker.ts` — entry point with SIGINT/SIGTERM handling
- [ ] `src/server/jobs/index.ts` — barrel export for clean imports
- [ ] `package.json` — has "worker" script
