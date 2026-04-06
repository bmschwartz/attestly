# Data Model Design

## Overview

Attestly's data model uses a pragmatic hybrid approach: JSON fields where data is always accessed as a unit (question options), normalized tables where SQL aggregation is needed (answers), and blockchain fields inlined on parent tables where the relationship is 1:1.

The database is PostgreSQL accessed through Prisma 7.

## Entities

### User

Internal user record decoupled from the auth provider (Privy). Uses its own UUID primary key with a `privyId` field for the external link, making the data model auth-provider-agnostic.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | Internal identifier |
| privyId | String | Unique | External Privy user ID |
| walletAddress | String | Unique | Privy embedded wallet address |
| email | String? | | From Privy profile, nullable |
| displayName | String? | | User-chosen display name, max 50 characters |
| avatar | String? | | URL to uploaded avatar image |
| bio | String? | | Short bio, max 200 characters |
| isAdmin | Boolean | | Default false. Grants access to /admin. |
| createdAt | DateTime | | Auto-set on creation |
| updatedAt | DateTime | | Auto-updated on change |

### Survey

Core survey entity. Blockchain fields are nullable — populated in Phase 2+, null during Phase 1.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| creatorId | UUID | FK -> User | Survey author |
| title | String | | Survey title |
| description | String | | Survey description |
| slug | String | Unique | SEO-friendly URL identifier |
| isPrivate | Boolean | | Default false. Part of on-chain commitment. |
| accessMode | Enum | | OPEN, INVITE_ONLY. Default OPEN. |
| resultsVisibility | Enum | | PUBLIC, RESPONDENTS, CREATOR. Default PUBLIC for public surveys, RESPONDENTS for private. |
| status | Enum | | DRAFT, PUBLISHED, CLOSED |
| publishedAt | DateTime? | | Set when status -> PUBLISHED |
| closedAt | DateTime? | | Set when status -> CLOSED |
| contentHash | String? | | EIP-712 hash, recorded on-chain at publication |
| ipfsCid | String? | | IPFS CID of pinned survey JSON. Set by publish worker. |
| publishTxHash | String? | | Base L2 transaction hash for publication |
| closeTxHash | String? | | Base L2 transaction hash for closure |
| verificationStatus | Enum | | NONE, PENDING, SUBMITTED, VERIFIED, FAILED. Default NONE. |
| categories | Json | | String array, 1-5 from fixed platform list. Required before publish. |
| tags | Json | | String array, 0-10 freeform tags. Optional. |
| featuredAt | DateTime? | | Set when admin features the survey. Null = not featured. |
| featuredOrder | Int? | | Display order on explore page. Null = not featured. |
| createdAt | DateTime | | |
| updatedAt | DateTime | | |

**Status transitions:** DRAFT -> PUBLISHED -> CLOSED. No reversals, no branching.

### Question

Questions belong to a survey. Options are stored as a JSON string array — they're always loaded with the parent question and never queried independently.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| surveyId | UUID | FK -> Survey | Parent survey |
| text | String | | Question text |
| questionType | Enum | | SINGLE_SELECT, MULTIPLE_CHOICE, RATING, FREE_TEXT |
| position | Int | UQ(surveyId, position) | Order within survey (0-indexed) |
| required | Boolean | | Whether answer is required |
| options | Json | | String array for choice-based questions, empty array for RATING/FREE_TEXT |
| minRating | Int? | | Min value for RATING type, null otherwise |
| maxRating | Int? | | Max value for RATING type, null otherwise |
| maxLength | Int? | | Max character length for FREE_TEXT type, null otherwise |
| createdAt | DateTime | | |
| updatedAt | DateTime | | |

**Validation:** A survey must have 1-100 questions before publication.

### Response

One response per user per survey, enforced by a unique compound constraint. Blockchain fields populated in Phase 2+.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| surveyId | UUID | FK -> Survey | Target survey |
| respondentId | UUID | FK -> User | Respondent |
| status | Enum | | IN_PROGRESS, SUBMITTED |
| submittedAt | DateTime? | | Set when status -> SUBMITTED, null while IN_PROGRESS |
| blindedId | String? | | keccak256(abi.encodePacked(walletAddress, surveyHash)), on-chain identifier |
| ipfsCid | String? | | IPFS content identifier for response data (Pinata) |
| submitTxHash | String? | | Base L2 transaction hash for submission |
| verificationStatus | Enum | | NONE, PENDING, SUBMITTED, VERIFIED, FAILED. Default NONE. |
| encryptionIv | String? | | Base64-encoded IV for AES-256-GCM encryption. Null for public surveys. |
| payoutStatus | Enum | | NONE, PENDING_REVIEW, APPROVED, REJECTED, PAID, PAYOUT_FAILED. Default NONE. |
| payoutAmount | Decimal? | | USDC paid to respondent. Null if no bounty. |
| payoutTxHash | String? | | Tx hash of USDC transfer. Null if no bounty. |
| payoutApprovedAt | DateTime? | | When creator approved or 24hr auto-approval triggered |
| deviceFingerprint | String? | | Hashed device fingerprint for paid survey fraud detection |
| createdAt | DateTime | | |
| updatedAt | DateTime | | Auto-updated on each save (progress tracking) |
| deletedAt | DateTime? | | Soft-delete timestamp. Set on IN_PROGRESS responses when survey closes. Null = active. |

**Unique constraint:** (surveyId, respondentId) where deletedAt is null — one active response per user per survey. A returning user picks up their IN_PROGRESS response. Soft-deleted responses are excluded from queries by default.

### Answer

Normalized table for individual question answers. Enables SQL aggregation for results dashboards (e.g., "72% chose Option A for Q3").

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| responseId | UUID | FK -> Response | Parent response |
| questionId | UUID | FK -> Question | Which question this answers |
| questionIndex | Int | | Same value as Question.position (denormalized for EIP-712 — the Answer must be self-describing) |
| questionType | Enum | | SINGLE_SELECT, MULTIPLE_CHOICE, RATING, FREE_TEXT |
| value | String | | Answer value (format depends on questionType) |

**Unique constraint:** (responseId, questionId) — one answer per question per response. Enables upsert in `response.saveAnswer` for auto-save.

**Value formats by questionType:**

| questionType | Format | Example | Validation |
|---|---|---|---|
| SINGLE_SELECT | Exact option string | `"Strongly Agree"` | Must match one of question.options |
| MULTIPLE_CHOICE | Sorted JSON array | `'["Option A","Option C"]'` | Each element must match an option, no duplicates |
| RATING | Integer string | `"4"` | Must parse to int within minRating-maxRating |
| FREE_TEXT | Raw string | `"I think..."` | length <= maxLength |

### EncryptionKey

For private surveys. Stores the per-survey AES-256 encryption key, encrypted with the AWS KMS master key (envelope encryption).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| surveyId | UUID | FK -> Survey, Unique | One key per private survey |
| encryptedKey | String | | Per-survey AES key, encrypted with KMS master key (base64) |
| createdAt | DateTime | | |

### SurveyInvite

For invite-only surveys (`accessMode = INVITE_ONLY`). Supports both individual email invites and domain-wide access.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| surveyId | UUID | FK -> Survey | Parent survey |
| type | Enum | | EMAIL, DOMAIN |
| value | String | | Email address or domain (e.g., `jane@example.com` or `acmecorp.com`) |
| invitedAt | DateTime | | When the invite was created |

**Unique constraint:** (surveyId, type, value) — no duplicate invites.

**Access check:** Respondent's email (from Privy) must match either a specific EMAIL invite or a DOMAIN invite for their email domain.

### Subscription

One subscription per user. Created at signup with FREE/ACTIVE defaults. Premium gating checks `plan` and `status`.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| userId | UUID | FK -> User, Unique | One subscription per user |
| plan | Enum | | FREE, PREMIUM, ENTERPRISE. Default FREE. |
| status | Enum | | ACTIVE, CANCELED, PAST_DUE, EXPIRED. Default ACTIVE. |
| currentPeriodStart | DateTime? | | Start of current billing period. Null for FREE. |
| currentPeriodEnd | DateTime? | | End of current billing period. Null for FREE. |
| stripeCustomerId | String? | | For future Stripe billing integration |
| stripeSubscriptionId | String? | | For future Stripe billing integration |
| createdAt | DateTime | | |
| updatedAt | DateTime | | |

**Premium gating:** all premium feature checks query `subscription.plan != FREE && subscription.status == ACTIVE`. Admin can manually set plan via `/admin`.

### ChatSession

Server-side chat sessions for AI insights. Persist indefinitely. Multiple sessions per survey per user.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| userId | UUID | FK -> User | Session owner |
| surveyId | UUID? | FK -> Survey | Null for cross-survey chat |
| surveyIds | Json? | | Array of survey IDs for cross-survey chat |
| title | String | | Auto-generated from first message, editable |
| messages | Json | | Array of {role, content, timestamp} |
| createdAt | DateTime | | |
| updatedAt | DateTime | | Updated on each new message |

On premium downgrade: sessions preserved but gated. Re-subscribe to regain access.

### BackgroundJob

Postgres-backed job queue for async operations: blockchain transactions, IPFS pinning, email delivery, AI summary generation.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| type | Enum | | PUBLISH_SURVEY, SUBMIT_RESPONSE, CLOSE_SURVEY, VERIFY_RESPONSES, SEND_EMAIL, GENERATE_AI_SUMMARY |
| status | Enum | | PENDING, PROCESSING, COMPLETED, FAILED |
| surveyId | UUID? | FK -> Survey | Null for non-survey jobs |
| responseId | UUID? | FK -> Response | Null for non-response jobs |
| payload | Json | | Job-specific data (e.g., email recipient, summary focus prompt) |
| retryCount | Int | | Default 0. Incremented on each retry. Max 3. |
| lastAttemptedAt | DateTime? | | Set on each attempt. Used for stale job detection (60-min timeout). |
| error | String? | | Last error message if failed |
| createdAt | DateTime | | |
| updatedAt | DateTime | | |

**Unique constraint:** `UNIQUE(type, surveyId, responseId) WHERE status IN ('PENDING', 'PROCESSING')` — prevents duplicate jobs for the same action.

**Stale job detection:** jobs with `status = PROCESSING` and `lastAttemptedAt` older than 60 minutes are reset to `PENDING` for auto-retry.

### AiSummary

LLM-generated summaries for survey results. One top-level summary per survey, plus one per free-text question.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| surveyId | UUID | FK -> Survey | |
| questionId | UUID? | FK -> Question | Null for top-level summary |
| content | String | | Generated summary text (markdown) |
| focusPrompt | String? | | Optional focus used for regeneration. Null for auto-generated. |
| generatedAt | DateTime | | When this summary was generated |

**Unique constraints:**
- `UNIQUE(surveyId, questionId)` where questionId is NOT NULL — one summary per question
- `UNIQUE(surveyId) WHERE questionId IS NULL` — partial unique index for one top-level summary per survey (PostgreSQL NULLs are not equal in standard unique constraints)

### SurveyBounty (Phase 4)

Added in Phase 4 for USDC escrow. Not implemented initially.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| surveyId | UUID | FK -> Survey, Unique | 1:1 relationship |
| totalAmount | Decimal | | Total USDC deposited (including top-offs) |
| perResponse | Decimal | | USDC per respondent |
| maxResponses | Int | | Total max responses (including top-offs) |
| remainingResponses | Int | | Decremented on each payout |
| escrowTxHash | String? | | Base L2 initial createBounty tx hash |
| currency | String | | Always "USDC" for Phase 4 |
| createdAt | DateTime | | |
| updatedAt | DateTime | | |

## Relationships

```
User 1:1 Subscription
User 1:N Survey        (creator)
Survey 1:1 EncryptionKey (private surveys only)
User 1:N Response      (respondent)
Survey 1:N Question
Survey 1:N Response
Response 1:N Answer
Question 1:N Answer
Survey 1:N ChatSession  (premium, AI chat history)
Survey 1:N AiSummary    (premium, generated on close)
Survey 1:N SurveyInvite (invite-only surveys)
Survey 1:1 SurveyBounty (Phase 4)
```

## Indexes

Beyond primary keys, foreign keys, and unique constraints:

- `Survey.creatorId` — fetch all surveys by a creator
- `Survey.slug` — unique, lookup by URL
- `Survey.status` — filter surveys by lifecycle state
- `Response.surveyId` — fetch all responses for a survey
- `Answer.questionId` — aggregate answers per question for results dashboards
- `SurveyInvite.surveyId` — fetch all invites for a survey
- `SurveyInvite(surveyId, type, value)` — unique, fast invite lookup
- `AiSummary.surveyId` — fetch all summaries for a survey

## Enums

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
  NONE        // Phase 1 — no blockchain
  PENDING     // Queued for on-chain submission
  SUBMITTED   // Tx submitted, awaiting confirmation
  VERIFIED    // Tx confirmed on-chain
  FAILED      // Tx failed after retries
}
```

## Design Decisions

1. **User.privyId as external mapping, not PK:** Internal UUID primary key decouples the data model from Privy. If the auth provider changes, only the mapping field changes — no foreign key migrations.

2. **Question.options as Json:** Options are simple string arrays always loaded with their parent question. A separate `Option` table would add joins for zero query benefit.

3. **Answer as a normalized table:** Results dashboards require aggregation across answers (counts, percentages, distributions). SQL aggregation on a normalized table is straightforward; aggregating across JSON blobs in a Response would be painful and slow.

4. **Blockchain fields inlined on parent tables:** contentHash, txHash, ipfsCid, blindedId are all 1:1 with their parent entity. A separate `BlockchainRecord` table would add unnecessary joins. These fields are nullable — null during Phase 1, populated starting Phase 2.

5. **Answer.questionIndex and Answer.questionType denormalized:** These duplicate data from the Question table but are needed for EIP-712 signing. The Answer must be self-describing for the signed struct without requiring a join to Question.

6. **Unique(surveyId, respondentId) on Response:** Application-level enforcement of one-response-per-user-per-survey. In Phase 2+, this is reinforced on-chain via blinded ID uniqueness.

7. **Response.status (IN_PROGRESS / SUBMITTED):** Respondents authenticate before starting a survey so their progress can be auto-saved. A returning user picks up their IN_PROGRESS response. Only SUBMITTED responses are signed, pinned to IPFS, and recorded on-chain.
