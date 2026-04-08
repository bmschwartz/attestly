-- AlterTable
ALTER TABLE "BackgroundJob" ADD COLUMN     "nextAttemptAt" TIMESTAMP(3);

-- RenameIndex
ALTER INDEX "Response_active_unique" RENAME TO "Response_surveyId_respondentId_key";
