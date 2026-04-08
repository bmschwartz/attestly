import type { BackgroundJob } from "../../../generated/prisma";
import { handleGenerateAiSummary } from "./handlers/generate-ai-summary";
import { handlePublishSurvey } from "./handlers/publish-survey";
import { handleSubmitResponse } from "./handlers/submit-response";
import { handleCloseSurvey } from "./handlers/close-survey";
import { handleVerifyResponses } from "./handlers/verify-responses";

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

// Register real handlers for blockchain job types
registerHandler("PUBLISH_SURVEY", handlePublishSurvey);
registerHandler("SUBMIT_RESPONSE", handleSubmitResponse);
registerHandler("CLOSE_SURVEY", handleCloseSurvey);
registerHandler("VERIFY_RESPONSES", handleVerifyResponses);
registerHandler("SEND_EMAIL", placeholderHandler("SEND_EMAIL"));
registerHandler("GENERATE_AI_SUMMARY", async (job) => {
  const payload = job.payload as {
    surveyId: string;
    focusPrompt?: string;
    questionId?: string;
  };
  await handleGenerateAiSummary(payload);
});
