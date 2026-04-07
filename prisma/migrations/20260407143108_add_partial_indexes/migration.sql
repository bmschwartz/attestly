-- Partial unique index: one active response per user per survey (soft-delete aware)
CREATE UNIQUE INDEX "Response_active_unique" ON "Response" ("surveyId", "respondentId") WHERE "deletedAt" IS NULL;

-- Drop the non-partial unique index that Prisma created
DROP INDEX IF EXISTS "Response_surveyId_respondentId_key";

-- Partial unique index: one top-level AI summary per survey (questionId IS NULL)
CREATE UNIQUE INDEX "AiSummary_topLevel_unique" ON "AiSummary" ("surveyId") WHERE "questionId" IS NULL;

-- Partial unique index: one pending/processing job per action
CREATE UNIQUE INDEX "BackgroundJob_dedup" ON "BackgroundJob" ("type", "surveyId", "responseId") WHERE "status" IN ('PENDING', 'PROCESSING');
