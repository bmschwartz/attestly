# Sub-Plan 1a: Prisma Schema Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the complete Prisma schema with all 12 entities, enums, indexes, relationships, and constraints for the Attestly platform.

**Architecture:** Single Prisma schema file with all models defined upfront. Blockchain and Phase 4 fields are included but nullable — this prevents future migrations when those phases are implemented. PostgreSQL is the database.

**Tech Stack:** Prisma 7, PostgreSQL

**Spec reference:** `docs/superpowers/specs/2026-04-04-data-model-design.md`

---

## File Structure

- Modify: `prisma/schema.prisma` — add all models, enums, indexes, relations
- No test files for this task — schema correctness is verified by `prisma db push` and `prisma generate`

---

### Task 0: Fix datasource block to include DATABASE_URL

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update the datasource block to include the connection URL**

The current `datasource db` block is missing the `url` field. Update it to:

```prisma
datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
}
```

- [ ] **Step 2: Verify the schema parses**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm prisma format`
Expected: schema is formatted without errors

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "fix: add DATABASE_URL to datasource block in Prisma schema"
```

---

### Task 1: Add all enums

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add all 12 enums to the schema**

Add after the `datasource db` block:

```prisma
enum SurveyStatus {
  DRAFT
  PUBLISHED
  CLOSED
}

enum QuestionType {
  SINGLE_SELECT
  MULTIPLE_CHOICE
  RATING
  FREE_TEXT
}

enum ResponseStatus {
  IN_PROGRESS
  SUBMITTED
}

enum AccessMode {
  OPEN
  INVITE_ONLY
}

enum ResultsVisibility {
  PUBLIC
  RESPONDENTS
  CREATOR
}

enum InviteType {
  EMAIL
  DOMAIN
}

enum SubscriptionPlan {
  FREE
  PREMIUM
  ENTERPRISE
}

enum SubscriptionStatus {
  ACTIVE
  CANCELED
  PAST_DUE
  EXPIRED
}

enum JobType {
  PUBLISH_SURVEY
  SUBMIT_RESPONSE
  CLOSE_SURVEY
  VERIFY_RESPONSES
  SEND_EMAIL
  GENERATE_AI_SUMMARY
}

enum JobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

enum PayoutStatus {
  NONE
  PENDING_REVIEW
  APPROVED
  REJECTED
  PAID
  PAYOUT_FAILED
}

enum VerificationStatus {
  NONE
  PENDING
  SUBMITTED
  VERIFIED
  FAILED
}
```

- [ ] **Step 2: Verify the schema parses**

Run: `cd /Users/bmschwartz/Development/attestly && pnpm prisma format`
Expected: schema is formatted without errors

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add all Prisma enums for Attestly data model"
```

---

### Task 2: Add User and Subscription models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add User model**

```prisma
model User {
  id            String   @id @default(uuid())
  privyId       String   @unique
  walletAddress String   @unique
  email         String?
  displayName   String?  @db.VarChar(50)
  avatar        String?
  bio           String?  @db.VarChar(200)
  isAdmin       Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  subscription  Subscription?
  surveys       Survey[]
  responses     Response[]
  chatSessions  ChatSession[]
}
```

- [ ] **Step 2: Add Subscription model**

```prisma
model Subscription {
  id                     String             @id @default(uuid())
  userId                 String             @unique
  plan                   SubscriptionPlan   @default(FREE)
  status                 SubscriptionStatus @default(ACTIVE)
  currentPeriodStart     DateTime?
  currentPeriodEnd       DateTime?
  stripeCustomerId       String?
  stripeSubscriptionId   String?
  createdAt              DateTime           @default(now())
  updatedAt              DateTime           @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 3: Verify the schema parses**

Run: `pnpm prisma format`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add User and Subscription models"
```

---

### Task 3: Add Survey and Question models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Survey model**

```prisma
model Survey {
  id                 String             @id @default(uuid())
  creatorId          String
  title              String
  description        String
  slug               String             @unique
  isPrivate          Boolean            @default(false)
  accessMode         AccessMode         @default(OPEN)
  resultsVisibility  ResultsVisibility  @default(PUBLIC)
  status             SurveyStatus       @default(DRAFT)
  publishedAt        DateTime?
  closedAt           DateTime?
  contentHash        String?
  ipfsCid            String?
  publishTxHash      String?
  closeTxHash        String?
  verificationStatus VerificationStatus @default(NONE)
  categories         Json               @default("[]")
  tags               Json               @default("[]")
  featuredAt         DateTime?
  featuredOrder      Int?
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  creator        User            @relation(fields: [creatorId], references: [id], onDelete: Cascade)
  questions      Question[]
  responses      Response[]
  invites        SurveyInvite[]
  encryptionKey  EncryptionKey?
  bounty         SurveyBounty?
  aiSummaries    AiSummary[]
  chatSessions   ChatSession[]
  backgroundJobs BackgroundJob[] @relation("SurveyJobs")

  @@index([creatorId])
  @@index([status])
}
```

- [ ] **Step 2: Add Question model**

```prisma
model Question {
  id           String       @id @default(uuid())
  surveyId     String
  text         String
  questionType QuestionType
  position     Int
  required     Boolean      @default(false)
  options      Json         @default("[]")
  minRating    Int?
  maxRating    Int?
  maxLength    Int?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  survey      Survey      @relation(fields: [surveyId], references: [id], onDelete: Cascade)
  answers     Answer[]
  aiSummaries AiSummary[]

  @@unique([surveyId, position])
}
```

- [ ] **Step 3: Verify the schema parses**

Run: `pnpm prisma format`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Survey and Question models"
```

---

### Task 4: Add Response and Answer models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Response model**

```prisma
model Response {
  id                 String             @id @default(uuid())
  surveyId           String
  respondentId       String
  status             ResponseStatus     @default(IN_PROGRESS)
  submittedAt        DateTime?
  blindedId          String?
  ipfsCid            String?
  submitTxHash       String?
  verificationStatus VerificationStatus @default(NONE)
  encryptionIv       String?
  payoutStatus       PayoutStatus       @default(NONE)
  payoutAmount       Decimal?
  payoutTxHash       String?
  payoutApprovedAt   DateTime?
  deviceFingerprint  String?
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt
  deletedAt          DateTime?

  survey         Survey          @relation(fields: [surveyId], references: [id], onDelete: Cascade)
  respondent     User            @relation(fields: [respondentId], references: [id], onDelete: Cascade)
  answers        Answer[]
  backgroundJobs BackgroundJob[] @relation("ResponseJobs")

  @@unique([surveyId, respondentId], map: "Response_surveyId_respondentId_key")
  @@index([surveyId])
}
```

Note: The unique constraint on `(surveyId, respondentId)` where `deletedAt IS NULL` cannot be expressed directly in Prisma. We will add a partial unique index via a raw SQL migration in a later step.

- [ ] **Step 2: Add Answer model**

```prisma
model Answer {
  id            String       @id @default(uuid())
  responseId    String
  questionId    String
  questionIndex Int
  questionType  QuestionType
  value         String

  response Response @relation(fields: [responseId], references: [id], onDelete: Cascade)
  question Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@unique([responseId, questionId])
  @@index([questionId])
}
```

- [ ] **Step 3: Verify the schema parses**

Run: `pnpm prisma format`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Response and Answer models"
```

---

### Task 5: Add SurveyInvite and EncryptionKey models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add SurveyInvite model**

```prisma
model SurveyInvite {
  id        String     @id @default(uuid())
  surveyId  String
  type      InviteType
  value     String
  invitedAt DateTime   @default(now())

  survey Survey @relation(fields: [surveyId], references: [id], onDelete: Cascade)

  @@unique([surveyId, type, value])
  @@index([surveyId])
}
```

- [ ] **Step 2: Add EncryptionKey model**

```prisma
model EncryptionKey {
  id           String   @id @default(uuid())
  surveyId     String   @unique
  encryptedKey String
  createdAt    DateTime @default(now())

  survey Survey @relation(fields: [surveyId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 3: Verify the schema parses**

Run: `pnpm prisma format`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add SurveyInvite and EncryptionKey models"
```

---

### Task 6: Add ChatSession, AiSummary, and BackgroundJob models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add ChatSession model**

```prisma
model ChatSession {
  id        String   @id @default(uuid())
  userId    String
  surveyId  String?
  surveyIds Json?
  title     String
  messages  Json     @default("[]")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  survey Survey? @relation(fields: [surveyId], references: [id], onDelete: SetNull)
}
```

- [ ] **Step 2: Add AiSummary model**

```prisma
model AiSummary {
  id          String    @id @default(uuid())
  surveyId    String
  questionId  String?
  content     String
  focusPrompt String?
  generatedAt DateTime  @default(now())

  survey   Survey    @relation(fields: [surveyId], references: [id], onDelete: Cascade)
  question Question? @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@unique([surveyId, questionId])
  @@index([surveyId])
}
```

Note: The partial unique index for top-level summaries (`UNIQUE(surveyId) WHERE questionId IS NULL`) will be added via raw SQL migration in Task 8, since Prisma doesn't support partial unique indexes natively.

- [ ] **Step 3: Add BackgroundJob model**

```prisma
model BackgroundJob {
  id              String    @id @default(uuid())
  type            JobType
  status          JobStatus @default(PENDING)
  surveyId        String?
  responseId      String?
  payload         Json      @default("{}")
  retryCount      Int       @default(0)
  lastAttemptedAt DateTime?
  error           String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  survey   Survey?   @relation("SurveyJobs", fields: [surveyId], references: [id], onDelete: SetNull)
  response Response? @relation("ResponseJobs", fields: [responseId], references: [id], onDelete: SetNull)

  @@index([status, type])
  @@index([surveyId])
}
```

- [ ] **Step 4: Verify the schema parses**

Run: `pnpm prisma format`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add ChatSession, AiSummary, and BackgroundJob models"
```

---

### Task 7: Add SurveyBounty model (Phase 4 placeholder)

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add SurveyBounty model**

```prisma
model SurveyBounty {
  id                 String   @id @default(uuid())
  surveyId           String   @unique
  totalAmount        Decimal
  perResponse        Decimal
  maxResponses       Int
  remainingResponses Int
  escrowTxHash       String?
  currency           String   @default("USDC")
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  survey Survey @relation(fields: [surveyId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Verify the full schema parses**

Run: `pnpm prisma format`
Expected: no errors — all 12 models and 12 enums present

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add SurveyBounty model (Phase 4 placeholder)"
```

---

### Task 8: Push schema to database and add partial indexes

**Files:**
- Modify: `prisma/schema.prisma` (if needed)
- Create: `prisma/migrations/` (auto-generated)

- [ ] **Step 1: Push the schema to the local database**

Run: `pnpm db:push`
Expected: all tables created successfully. If the database doesn't exist, create it first:

```bash
createdb attestly
```

Then retry `pnpm db:push`.

- [ ] **Step 2: Create a migration for partial unique indexes**

Prisma doesn't support partial unique indexes or filtered unique constraints natively. Create a manual migration:

Run: `pnpm prisma migrate dev --name add_partial_indexes --create-only`

This creates a migration file without applying it. Edit the generated SQL file at `prisma/migrations/<timestamp>_add_partial_indexes/migration.sql` and add:

```sql
-- Partial unique index: one active response per user per survey (soft-delete aware)
CREATE UNIQUE INDEX "Response_active_unique" ON "Response" ("surveyId", "respondentId") WHERE "deletedAt" IS NULL;

-- Drop the non-partial unique index that Prisma created
DROP INDEX IF EXISTS "Response_surveyId_respondentId_key";

-- Partial unique index: one top-level AI summary per survey (questionId IS NULL)
CREATE UNIQUE INDEX "AiSummary_topLevel_unique" ON "AiSummary" ("surveyId") WHERE "questionId" IS NULL;

-- Partial unique index: one pending/processing job per action
CREATE UNIQUE INDEX "BackgroundJob_dedup" ON "BackgroundJob" ("type", "surveyId", "responseId") WHERE "status" IN ('PENDING', 'PROCESSING');
```

- [ ] **Step 3: Apply the migration**

Run: `pnpm prisma migrate dev`
Expected: migration applied successfully

- [ ] **Step 4: Generate the Prisma client**

Run: `pnpm prisma generate`
Expected: client generated at `generated/prisma/`

- [ ] **Step 5: Verify by opening Prisma Studio**

Run: `pnpm db:studio`
Expected: browser opens, all 12 tables visible with correct columns and types. Close after verification.

- [ ] **Step 6: Commit**

```bash
git add prisma/
git commit -m "feat: push schema to database with partial unique indexes"
```

---

### Task 9: Add seed data for development

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` — add seed script

- [ ] **Step 1: Create seed file**

Create `prisma/seed.ts`:

```typescript
import { PrismaClient, QuestionType, SurveyStatus } from "../generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // Create a test user
  const user = await prisma.user.upsert({
    where: { privyId: "test-privy-id" },
    update: {},
    create: {
      privyId: "test-privy-id",
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      email: "test@attestly.com",
      displayName: "Test User",
      isAdmin: true,
      subscription: {
        create: {
          plan: "PREMIUM",
          status: "ACTIVE",
        },
      },
    },
  });

  // Create a second user (respondent)
  const respondent = await prisma.user.upsert({
    where: { privyId: "test-respondent-id" },
    update: {},
    create: {
      privyId: "test-respondent-id",
      walletAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
      email: "respondent@example.com",
      displayName: "Test Respondent",
      subscription: {
        create: {
          plan: "FREE",
          status: "ACTIVE",
        },
      },
    },
  });

  // Create a draft survey
  const draftSurvey = await prisma.survey.upsert({
    where: { slug: "draft-survey-x1a2" },
    update: {},
    create: {
      creatorId: user.id,
      title: "Draft Survey",
      description: "A survey still being built",
      slug: "draft-survey-x1a2",
      status: SurveyStatus.DRAFT,
      categories: ["Research"],
      tags: ["test"],
    },
  });

  // Create a published survey with questions
  const publishedSurvey = await prisma.survey.upsert({
    where: { slug: "employee-satisfaction-k3m7" },
    update: {},
    create: {
      creatorId: user.id,
      title: "Employee Satisfaction Survey 2026",
      description: "We'd love to hear your honest feedback about your experience.",
      slug: "employee-satisfaction-k3m7",
      status: SurveyStatus.PUBLISHED,
      publishedAt: new Date(),
      categories: ["Business", "Research"],
      tags: ["workplace", "feedback"],
    },
  });

  // Add questions to the published survey
  const questions = [
    {
      surveyId: publishedSurvey.id,
      text: "How satisfied are you with your role?",
      questionType: QuestionType.SINGLE_SELECT,
      position: 0,
      required: true,
      options: ["Very Satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very Dissatisfied"],
    },
    {
      surveyId: publishedSurvey.id,
      text: "Rate your work-life balance",
      questionType: QuestionType.RATING,
      position: 1,
      required: true,
      options: [],
      minRating: 1,
      maxRating: 5,
    },
    {
      surveyId: publishedSurvey.id,
      text: "Select all benefits that matter to you",
      questionType: QuestionType.MULTIPLE_CHOICE,
      position: 2,
      required: false,
      options: ["Health Insurance", "Remote Work", "Professional Development", "Stock Options"],
    },
    {
      surveyId: publishedSurvey.id,
      text: "Any additional comments?",
      questionType: QuestionType.FREE_TEXT,
      position: 3,
      required: false,
      options: [],
      maxLength: 500,
    },
  ];

  for (const q of questions) {
    await prisma.question.upsert({
      where: {
        surveyId_position: {
          surveyId: q.surveyId,
          position: q.position,
        },
      },
      update: {},
      create: q,
    });
  }

  console.log("Seed data created:");
  console.log(`  Users: ${user.displayName}, ${respondent.displayName}`);
  console.log(`  Surveys: ${draftSurvey.title}, ${publishedSurvey.title}`);
  console.log(`  Questions: ${questions.length} on published survey`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Add seed config to package.json**

Add to `package.json`:

```json
{
  "prisma": {
    "seed": "npx tsx prisma/seed.ts"
  }
}
```

Also add the `db:seed` script to the `scripts` section:

```json
{
  "scripts": {
    "db:seed": "prisma db seed"
  }
}
```

- [ ] **Step 3: Install tsx as a dev dependency**

Run: `pnpm add -D tsx`

- [ ] **Step 4: Run the seed**

Run: `pnpm db:seed`
Expected output:
```
Seed data created:
  Users: Test User, Test Respondent
  Surveys: Draft Survey, Employee Satisfaction Survey 2026
  Questions: 4 on published survey
```

- [ ] **Step 5: Verify in Prisma Studio**

Run: `pnpm db:studio`
Expected: User table has 2 rows, Survey table has 2 rows, Question table has 4 rows, Subscription table has 2 rows. Close after verification.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts package.json pnpm-lock.yaml
git commit -m "feat: add seed data for development"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `pnpm prisma format` — no errors
- [ ] `pnpm prisma generate` — client generates successfully
- [ ] `pnpm db:push` — all tables exist
- [ ] `pnpm db:seed` — seed data loads
- [ ] `pnpm typecheck` — no TypeScript errors
- [ ] Prisma Studio shows all 12 tables with correct columns
- [ ] All 12 enums are defined
- [ ] Partial unique indexes exist (Response active, AiSummary top-level, BackgroundJob dedup)
