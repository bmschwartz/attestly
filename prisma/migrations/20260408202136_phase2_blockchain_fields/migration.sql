-- AlterTable
ALTER TABLE "Response" ADD COLUMN     "submitBlockNumber" TEXT,
ADD COLUMN     "submitBlockTimestamp" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Survey" ADD COLUMN     "closeBlockNumber" TEXT,
ADD COLUMN     "closeBlockTimestamp" TIMESTAMP(3),
ADD COLUMN     "publishBlockNumber" TEXT,
ADD COLUMN     "publishBlockTimestamp" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "VerificationResult" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "dbResponseCount" INTEGER NOT NULL,
    "onChainResponseCount" INTEGER NOT NULL,
    "ipfsVerifiedCount" INTEGER NOT NULL,
    "errors" TEXT[],
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerificationResult_surveyId_key" ON "VerificationResult"("surveyId");

-- AddForeignKey
ALTER TABLE "VerificationResult" ADD CONSTRAINT "VerificationResult_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
