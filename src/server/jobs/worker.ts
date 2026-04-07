import { claimNextJob, completeJob, failJob, resetStaleJobs, isReadyForRetry } from "./queue";
import { getHandler } from "./handlers";
import type { JobType } from "../../../generated/prisma";

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
        options.jobTypes as JobType[] | undefined,
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
