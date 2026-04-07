import type { BackgroundJob } from "../../../generated/prisma";
import { handleGenerateAiSummary } from "./handlers/generate-ai-summary";

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
registerHandler("GENERATE_AI_SUMMARY", async (job) => {
  const payload = job.payload as {
    surveyId: string;
    focusPrompt?: string;
    questionId?: string;
  };
  await handleGenerateAiSummary(payload);
});
