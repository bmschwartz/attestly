import {
  claimNextJob,
  completeJob,
  failJob,
  releaseJob,
  resetStaleJobs,
  isReadyForRetry,
  getRetryDelay,
  areDependenciesMet,
} from "./queue";
import { db } from "./db";
import { getHandler } from "./handlers";
import {
  PermanentTransactionError,
  GasCeilingExceededError,
} from "~/server/blockchain/relayer";
import type { JobType } from "../../../generated/prisma";

/**
 * Revert the parent entity to its pre-transition state when a blockchain
 * job permanently fails (retries exhausted or permanent error).
 */
async function revertGatingState(
  jobType: string,
  surveyId: string | null,
  responseId: string | null,
): Promise<void> {
  try {
    switch (jobType) {
      case "PUBLISH_SURVEY":
        if (surveyId) {
          await db.survey.update({
            where: { id: surveyId },
            data: { status: "DRAFT" },
          });
          console.log(`[Worker] Reverted survey ${surveyId} to DRAFT`);
        }
        break;
      case "SUBMIT_RESPONSE":
        if (responseId) {
          await db.response.update({
            where: { id: responseId },
            data: { status: "IN_PROGRESS" },
          });
          console.log(`[Worker] Reverted response ${responseId} to IN_PROGRESS`);
        }
        break;
      case "CLOSE_SURVEY":
        if (surveyId) {
          await db.survey.update({
            where: { id: surveyId },
            data: { status: "PUBLISHED" },
          });
          console.log(`[Worker] Reverted survey ${surveyId} to PUBLISHED`);
        }
        break;
    }
  } catch (err) {
    console.error(`[Worker] Failed to revert gating state for ${jobType}:`, err);
  }
}

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

      // Note: Backoff is now handled by nextAttemptAt in claimNextJob's WHERE clause.
      // When failJob sets a job back to PENDING, we set nextAttemptAt to enforce the
      // backoff delay. claimNextJob skips jobs where nextAttemptAt > now.
      // No need for a separate isReadyForRetry check here.

      // Check if job dependencies are met (e.g. SUBMIT_RESPONSE waits for PUBLISH_SURVEY)
      let depsMet: boolean;
      try {
        depsMet = await areDependenciesMet(job);
      } catch (err) {
        // Dependency permanently failed — mark this job FAILED immediately
        await db.backgroundJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            error: err instanceof Error ? err.message : String(err),
          },
        });
        console.error(
          `[Worker] Job ${job.id} (${job.type}) failed — dependency error:`,
          err,
        );
        return true;
      }

      if (!depsMet) {
        // Release back to PENDING with a short deferral — does NOT increment retryCount.
        await releaseJob(job.id, 5_000);
        console.log(
          `[Worker] Job ${job.id} (${job.type}) deferred 5s — dependencies not yet met`,
        );
        return true;
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

        if (error instanceof PermanentTransactionError) {
          // Permanent failure — mark FAILED directly, don't burn retries
          await db.backgroundJob.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              error: errorMessage,
            },
          });
          await revertGatingState(job.type, job.surveyId, job.responseId);
        } else if (error instanceof GasCeilingExceededError) {
          // Gas spike — release with 60s delay, don't burn retry
          await releaseJob(job.id, 60_000);
        } else {
          const updatedJob = await failJob(job.id, errorMessage);
          // If failJob transitioned to FAILED (retries exhausted), revert gating state
          if (updatedJob.status === "FAILED") {
            await revertGatingState(job.type, job.surveyId, job.responseId);
          }
        }
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
