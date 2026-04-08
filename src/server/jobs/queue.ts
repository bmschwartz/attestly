import { db } from "./db";
import type { JobType } from "../../../generated/prisma";

/** Default backoff schedule in milliseconds for retries: 5s, 30s, 5min */
const DEFAULT_BACKOFF_MS = [5_000, 30_000, 300_000] as const;

/** Default maximum number of retry attempts before marking as FAILED */
const DEFAULT_MAX_RETRIES = 3;

/** Blockchain jobs get extended retry budget (~50 minutes total) */
const BLOCKCHAIN_MAX_RETRIES = 10;
const BLOCKCHAIN_BACKOFF_MS = [
  5_000, // 5s
  15_000, // 15s
  30_000, // 30s
  60_000, // 1m
  120_000, // 2m
  300_000, // 5m
  600_000, // 10m
  1_800_000, // 30m
] as const;

const BLOCKCHAIN_JOB_TYPES: Set<string> = new Set([
  "PUBLISH_SURVEY",
  "SUBMIT_RESPONSE",
  "CLOSE_SURVEY",
]);

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
      payload: (input.payload ?? {}) as object,
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
  const now = new Date();
  // Find the oldest pending job whose deferral window (if any) has expired
  const pendingJob = await db.backgroundJob.findFirst({
    where: {
      status: "PENDING",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
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
  const maxRetries = getMaxRetries(job.type);

  if (nextRetryCount >= maxRetries) {
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

/**
 * Get the maximum retry count for a given job type.
 * Blockchain jobs get an extended budget; all others use the default.
 */
export function getMaxRetries(jobType: string): number {
  return BLOCKCHAIN_JOB_TYPES.has(jobType)
    ? BLOCKCHAIN_MAX_RETRIES
    : DEFAULT_MAX_RETRIES;
}

/**
 * Get the backoff delay in milliseconds for the given retry count.
 * Returns 0 for the first attempt (no delay).
 * Blockchain job types use an extended backoff schedule.
 */
export function getRetryDelay(
  retryCount: number,
  jobType?: string,
): number {
  if (retryCount <= 0) return 0;
  const schedule =
    jobType && BLOCKCHAIN_JOB_TYPES.has(jobType)
      ? BLOCKCHAIN_BACKOFF_MS
      : DEFAULT_BACKOFF_MS;
  const index = Math.min(retryCount - 1, schedule.length - 1);
  return schedule[index]!;
}

/**
 * Check if a job should be retried now based on its retry count,
 * lastAttemptedAt timestamp, and job type (for per-type backoff).
 */
export function isReadyForRetry(
  retryCount: number,
  lastAttemptedAt: Date | null,
  jobType?: string,
): boolean {
  if (retryCount === 0) return true;
  if (!lastAttemptedAt) return true;

  const delay = getRetryDelay(retryCount, jobType);
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

/**
 * Check if a job's dependencies are satisfied.
 *
 * - SUBMIT_RESPONSE: requires PUBLISH_SURVEY for the same survey to be COMPLETED
 *   (throws a permanent error if PUBLISH_SURVEY FAILED -- no point retrying)
 * - CLOSE_SURVEY: requires all SUBMIT_RESPONSE jobs for the same survey to be COMPLETED
 * - All other job types: no dependencies
 *
 * @returns true if the job can be processed, false if it should wait
 * @throws Error if a dependency permanently failed (caller should mark the job FAILED)
 */
export async function areDependenciesMet(
  job: { type: string; surveyId: string | null },
): Promise<boolean> {
  if (job.type === "SUBMIT_RESPONSE" && job.surveyId) {
    // Check for a FAILED PUBLISH_SURVEY -- no point retrying if publish permanently failed
    const failedPublishJob = await db.backgroundJob.findFirst({
      where: {
        type: "PUBLISH_SURVEY",
        surveyId: job.surveyId,
        status: "FAILED",
      },
    });
    if (failedPublishJob) {
      throw new Error(
        `PUBLISH_SURVEY job ${failedPublishJob.id} permanently failed for survey ${job.surveyId}. ` +
          `Cannot submit response -- marking job as FAILED.`,
      );
    }

    // Check if PUBLISH_SURVEY is still in progress
    const pendingPublishJob = await db.backgroundJob.findFirst({
      where: {
        type: "PUBLISH_SURVEY",
        surveyId: job.surveyId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
    if (pendingPublishJob) return false;
  }

  if (job.type === "CLOSE_SURVEY" && job.surveyId) {
    // Check if all SUBMIT_RESPONSE jobs are completed for this survey
    const pendingResponses = await db.backgroundJob.findFirst({
      where: {
        type: "SUBMIT_RESPONSE",
        surveyId: job.surveyId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
    if (pendingResponses) return false;
  }

  return true;
}

export {
  DEFAULT_MAX_RETRIES,
  DEFAULT_BACKOFF_MS,
  BLOCKCHAIN_MAX_RETRIES,
  BLOCKCHAIN_BACKOFF_MS,
  STALE_JOB_TIMEOUT_MINUTES,
};
