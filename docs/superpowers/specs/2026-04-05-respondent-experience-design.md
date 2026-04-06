# Respondent Experience Design

## Overview

The respondent experience covers everything a survey participant sees: landing on a survey link, authenticating, answering questions, submitting, and viewing results after the survey closes. Designed for minimal friction with auto-save progress tracking.

## Routes

| Route | Auth | Description |
|-------|------|-------------|
| `/s/[slug]` | Public | Survey landing page — preview, metadata, "Start Survey" |
| `/s/[slug]/respond` | Protected | Survey response page — answer questions, auto-save, submit |
| `/s/[slug]/confirmation` | Protected | Post-submit confirmation with verification proof |
| `/s/[slug]/results` | Varies | Results page — access depends on `resultsVisibility` setting |
| `/my-responses` | Protected | List of all surveys the respondent has participated in |

## Survey Landing Page (`/s/[slug]`)

Public route — no auth required. This is the first thing a respondent sees when clicking a survey link.

### Content

- Survey title
- Creator identity (wallet address, or ENS name if available, or display name)
- Survey description
- Question count and estimated time (based on ~30 seconds per question)
- "Start Survey" button
- Verification badge (Phase 2+): "Verified on-chain" with link to block explorer
- Publication date

### Access States

| State | Behavior |
|-------|----------|
| Survey is DRAFT | 404 — drafts are not publicly visible |
| Survey is PUBLISHED, OPEN access | Show landing page with "Start Survey" |
| Survey is PUBLISHED, INVITE_ONLY | Show landing page. "Start Survey" triggers auth, then access check. If not invited: "This survey is invite-only." |
| Survey is CLOSED | Show landing page with "This survey is closed" + results link (if visible to public) |
| Respondent already SUBMITTED | Redirect to confirmation page |
| Respondent has IN_PROGRESS response | Redirect to response page (resume) |

## Survey Response Page (`/s/[slug]/respond`)

Protected route — requires Privy auth. Respondent authenticated when they clicked "Start Survey" on the landing page.

### Layout

Single scrollable page with all questions visible:

- **Header:** Survey title, save status ("Saving..." / "All changes saved"), "Submit" button
- **Body:** All questions in order, numbered, with type-appropriate input controls
- **Footer:** Progress counter ("X of Y answered")

### Question Rendering

| Question Type | Input Control |
|---------------|--------------|
| Single Select | Radio button group with option labels |
| Multiple Choice | Checkbox group with option labels |
| Rating | Clickable numbered buttons from min to max (ranges up to 10), number input for ranges > 10 |
| Free Text | Textarea with character counter showing current/max |

- Required questions marked with an asterisk (*)
- Unanswered required questions highlighted on submit attempt

### Auto-Save

- Every answer change triggers a debounced save (1-2 seconds after last change)
- Save status indicator in header: "Saving..." / "All changes saved" / "Save failed"
- Answers saved individually via tRPC mutation — upsert Answer by (responseId, questionId)
- Response remains in `IN_PROGRESS` status during auto-save
- If respondent closes the tab and returns later, they resume where they left off

### Submit Flow

1. Respondent clicks "Submit"
2. Client-side validation: all required questions must be answered
3. If validation fails: scroll to first unanswered required question, highlight it
4. If validation passes: confirmation dialog — "Submit your response? This cannot be changed after submission."
5. On confirm: tRPC mutation sets Response status to `SUBMITTED`, sets `submittedAt`
6. In Phase 2+: response is signed with wallet (EIP-712), encrypted if private, pinned to IPFS, recorded on-chain
7. Redirect to confirmation page

## Post-Submit Confirmation Page (`/s/[slug]/confirmation`)

Protected route — only visible to the respondent who submitted.

### Content

- Success message: "Response Submitted"
- Survey title
- Verification proof section (expandable):
  - Blinded ID
  - Survey hash
  - In Phase 1: "Recorded" status
  - In Phase 2+: IPFS CID (link to gateway), transaction hash (link to block explorer)
- Results notice: "Survey results will be available when this survey closes."
- Email notice: "We'll send you an email at {email} when results are ready."
  - If no email on file: "Add an email to be notified when results are ready." (link to Privy profile)

## Survey Close & Email Notification

When a survey creator closes a survey:

1. Survey status transitions to CLOSED
2. All respondents with `SUBMITTED` responses are queried
3. Email sent to each respondent with an email on file:
   - **Subject:** "Results are in: {survey title}"
   - **Body:** Brief message + link to results page (`/s/[slug]/results`)
4. In Phase 2+: close transaction recorded on-chain

### Email Delivery

- **Provider:** Resend (TypeScript-first, simple API, good Next.js integration)
- **Env var:** `RESEND_API_KEY` (add to `src/env.js` server-side validation)
- Emails are queued via BackgroundJob (`SEND_EMAIL` type) — don't block the close mutation
- Resend dashboard provides delivery monitoring; no custom tracking table at launch
- Two email templates:
  - **Survey close notification:** "Results are in: {survey title}" + link to results page
  - **Survey invitation:** "You're invited: {survey title}" + survey description + link to landing page

## Results Page (`/s/[slug]/results`)

Access controlled by `resultsVisibility` on the survey:

| resultsVisibility | Who can access |
|-------------------|----------------|
| `PUBLIC` | Anyone — no auth required |
| `RESPONDENTS` | Only users who submitted a response — auth required, access check |
| `CREATOR` | Only the survey creator — auth required, access check |

### Availability

- Results page returns "Results are not yet available" while survey is PUBLISHED (still collecting responses)
- Results become accessible when survey status is CLOSED
- Exception: creator can always view real-time results from their dashboard, even while survey is open

## Invite-Only Surveys

For surveys with `accessMode = INVITE_ONLY`:

### Landing Page Behavior

- Landing page is publicly visible (respondent can see what the survey is about)
- "Start Survey" triggers Privy auth
- After auth, respondent's email (from Privy) is checked against SurveyInvite records:
  - Match on `type=EMAIL, value=respondent@example.com` — access granted
  - Match on `type=DOMAIN, value=example.com` (respondent's email domain) — access granted
  - No match — "You are not invited to this survey. Contact the survey creator for access."

### Creator Invite Management

- Creator manages invites from the survey builder (draft state) or survey dashboard
- Add individual emails: text input, one at a time or comma-separated bulk entry
- Add domain: text input for domain (e.g., `acmecorp.com`)
- View/remove existing invites
- Invite count shown on survey dashboard

### Email Invitations

- When creator adds an EMAIL invite, an invitation email is sent:
  - **Subject:** "You're invited: {survey title}"
  - **Body:** Survey description + direct link to survey landing page
- Domain invites do not trigger emails (no specific recipients to email)
- Invitation emails are sent immediately on invite creation

## My Responses Page (`/my-responses`)

Protected route — requires auth. Shows all surveys the authenticated user has participated in.

### Content

A list of response cards, each showing:

- Survey title (links to survey landing page)
- Submitted date
- Response status:
  - **In Progress** — link to resume (`/s/[slug]/respond`)
  - **Submitted, awaiting results** — survey still open, link to confirmation page
  - **Results available** — survey closed, link to results page
- Verification proof summary (blinded ID, Phase 2+: tx hash)

Sorted by most recent first. Serves as the respondent's home base within Attestly — a reason to return beyond email notifications.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Respondent visits survey they already submitted | Redirect to confirmation page with verification proof |
| Respondent has IN_PROGRESS response | Resume draft — redirect to response page |
| Survey closed while respondent is mid-response | Hard cutoff. IN_PROGRESS response is soft-deleted. Respondent sees "This survey has closed" on their next page load or submit attempt. Their unsaved progress is lost — no post-close submissions are accepted (API rejects, contract rejects). |
| Survey closed, respondent never submitted | Landing page shows "This survey is closed" |
| Respondent not invited to invite-only survey | "You are not invited to this survey" after auth |
| Respondent has no email on file | Skip close notification. Show prompt to add email on confirmation page. |
| Survey has 0 responses when closed | No emails sent. Results page shows "No responses were collected." |
| Respondent wants to withdraw a submitted response | Not allowed. Responses are permanent once submitted. Consistent across Phase 1 and Phase 2+ (on-chain). Prevents creators from pressuring respondents to withdraw unfavorable responses. |
| Respondent wants to start over on an IN_PROGRESS response | "Clear responses" button on the response page. Deletes all saved answers for this response, resets to blank. Respondent starts fresh. |
| Survey closes while IN_PROGRESS responses exist | Soft-delete all IN_PROGRESS responses (set `deletedAt`). They are excluded from results and aggregations. Creator sees incomplete count in a separate "Incomplete Responses" section. |
| Respondent abandons a survey for a long time | IN_PROGRESS response persists as long as the survey is PUBLISHED. No expiry timeout. Cleaned up on survey close. |
| Survey has reached response limit (free tier: 50) | Landing page shows "This survey has reached its response limit." Respondent cannot start a new response. Enforced in `response.start` tRPC mutation: query creator's Subscription plan, if FREE count SUBMITTED responses, reject if >= 50. Application-level business rule, not on-chain. |

## tRPC Procedures

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `survey.getBySlug` | Query | Public | Get published survey for landing page |
| `survey.getForResponse` | Query | Protected | Get survey with questions for responding (checks access for invite-only) |
| `response.start` | Mutation | Protected | Create IN_PROGRESS response, returns existing if already started |
| `response.saveAnswer` | Mutation | Protected | Upsert a single answer (auto-save) |
| `response.submit` | Mutation | Protected | Validate and set status to SUBMITTED |
| `response.clear` | Mutation | Protected | Delete all answers for an IN_PROGRESS response, reset to blank. Respondent can start over. |
| `response.getConfirmation` | Query | Protected | Get confirmation data + verification proof for respondent |
| `results.getBySurvey` | Query | Varies | See results-analytics spec for canonical definition |
| `invite.check` | Query | Protected | Check if authenticated user is invited to a survey |
| `response.listMine` | Query | Protected | Get all responses by the authenticated user (for My Responses page) |

## Component Structure

```
SurveyLandingPage (/s/[slug])
├── SurveyHeader (title, creator, verification badge)
├── SurveyDescription
├── SurveyMeta (question count, estimated time, published date)
├── StartSurveyButton (triggers Privy auth)
└── ClosedSurveyNotice (if closed, with results link)

SurveyResponsePage (/s/[slug]/respond)
├── ResponseHeader (title, save status, submit button)
├── QuestionList
│   └── QuestionRenderer (per question)
│       ├── SingleSelectInput
│       ├── MultipleChoiceInput
│       ├── RatingInput
│       └── FreeTextInput
└── ResponseFooter (progress counter)

ConfirmationPage (/s/[slug]/confirmation)
├── SuccessMessage
├── VerificationProof (expandable)
└── ResultsNotice (email notification info)

ResultsPage (/s/[slug]/results)
├── ResultsHeader (title, response count, close date)
└── ResultsCharts (per question aggregations)

MyResponsesPage (/my-responses)
├── ResponseList
│   └── ResponseCard (per response)
│       ├── SurveyTitle
│       ├── SubmittedDate
│       ├── Status (waiting for results / results available)
│       └── Links (confirmation page, results page if available)
```

## Additional Decisions

### No Response Withdrawal
Submitted responses cannot be withdrawn or deleted, in any phase. This is a trust model requirement — if responses could be removed, creators could pressure respondents to withdraw unfavorable responses. Behavior is consistent across Phase 1 (database only) and Phase 2+ (on-chain).

### Mobile-First
All respondent-facing pages (landing, response, confirmation, results, my-responses) are designed mobile-first. Survey links will commonly be shared via messaging apps and opened on phones.

### App Shell
Top navbar:
- **Authenticated:** Logo | Explore | Dashboard | My Responses | [Avatar dropdown]
- **Unauthenticated:** Logo | Explore | [Sign In]
- **During survey response:** Minimal navbar (logo + save status only) to keep respondents focused

### Premium Upsell Pattern
All premium features are **visible but gated** for free users — shown in their natural location with a specific value proposition, not hidden behind a generic upgrade page:

**Usage limits (free tier):**
- **Max 5 surveys** — when limit reached, "New Survey" button shows: "You've reached the free plan limit of 5 surveys. Upgrade for unlimited."
- **Max 50 responses per survey** — survey auto-stops accepting responses at 50. Landing page shows: "This survey has reached its response limit." Creator sees: "50/50 responses collected. Upgrade for unlimited responses."

**Feature gates (free tier):**
- **Private toggle in builder:** visible with lock icon — "Make responses private — available on Premium"
- **Invite-only toggle in builder:** visible with lock icon — "Restrict to invited participants — available on Premium"
- **Results visibility options:** "Respondents Only" and "Creator Only" shown as disabled dropdown options
- **AI Summary on results:** blurred placeholder card — "AI found N insights. Upgrade to read them."
- **Chat sidebar on results:** disabled toggle — "Chat with your survey data — available on Premium"
- **Cross-survey insights on dashboard:** visible link with premium badge, gated on click
