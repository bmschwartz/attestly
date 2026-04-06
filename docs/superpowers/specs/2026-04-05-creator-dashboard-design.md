# Creator Dashboard Design

## Overview

The creator dashboard is the home base for survey creators — an overview of their survey program with stats, a filterable/sortable survey list with status-specific cards and actions, and inline invite management for invite-only surveys.

## Route

`/dashboard` — protected route, requires auth. Shows only the authenticated user's surveys.

## Page Layout

### Overview Stats

Three stat cards at the top of the page:

| Stat | Value | Calculation |
|------|-------|-------------|
| **Surveys** | Total count | All surveys by this creator (all statuses) |
| **Responses** | Total responses | Sum of SUBMITTED response count across all surveys |
| **Active** | Active surveys | Count of PUBLISHED surveys |

### Survey List

Below the overview stats. Contains:

- **"+ New Survey" button** — creates a new draft survey, redirects to builder (`/surveys/[id]/edit`)
- **Status filter tabs:** All / Draft / Published / Closed. Defaults to "All."
- **Sort dropdown:** Newest first (default), Oldest first, Most responses, Alphabetical

### Survey Cards

Each survey is rendered as a card. Content and actions vary by status:

#### Draft Card
- Title + "Draft" status badge
- Question count
- Created date
- **Actions:** Edit, Delete

#### Published Card
- Title + "Published" status badge
- Response count
- Published date
- Shareable link (`attestly.com/s/[slug]`)
- Mini chart: first question's top-line result (e.g., "Q1 satisfaction: 70% positive")
- If invite-only: invite count + responded count
- If private: lock icon indicator
- **Actions:** View Results, Copy Link, Close Survey
- **Additional for invite-only:** Manage Invites

#### Closed Card
- Title + "Closed" status badge
- Final response count
- Closed date
- **Actions:** View Results

## Actions

### + New Survey
Creates a new draft survey via `survey.create` mutation. Redirects to `/surveys/[id]/edit` (survey builder).

**Free tier limit:** max 5 surveys total. When limit reached, the button is disabled and shows: "You've reached the free plan limit of 5 surveys. Upgrade for unlimited." The survey count in Overview Stats helps creators see where they stand.

### Edit
Opens the survey builder for a draft survey. Route: `/surveys/[id]/edit`.

### Delete
Hard deletes a draft survey. Only available for DRAFT status.
- Confirmation dialog: "Delete this draft? This cannot be undone."
- On confirm: `survey.deleteDraft` mutation
- Card removed from list

### View Results
Opens results for the survey.
- For PUBLISHED surveys: creator-only real-time results view (uses `results.getForCreator`)
- For CLOSED surveys: standard results page (`/s/[slug]/results`)

### Copy Link
Copies the shareable survey URL (`attestly.com/s/[slug]`) to clipboard. Shows a brief "Copied!" toast notification.

### Close Survey
Transitions a PUBLISHED survey to CLOSED. This is the complete close procedure (consolidated across all phases):

- Confirmation dialog: "Close this survey? No more responses will be accepted. All respondents will be notified via email."
- On confirm, `survey.close` mutation performs:

**Phase 1 (always):**
1. Set survey status → CLOSED, set `closedAt`
2. Soft-delete all IN_PROGRESS responses (set `deletedAt`) — hard cutoff, no post-close submissions
3. Queue `SEND_EMAIL` background jobs — one per respondent with email on file
4. Queue `GENERATE_AI_SUMMARY` background job (if premium) — top-level + per-free-text-question summaries

**Phase 2+ (additionally):**
5. Queue `CLOSE_SURVEY` background job — submits `closeSurvey()` tx to Base contract
6. Queue `VERIFY_RESPONSES` background job — runs full response integrity check, caches result

**Phase 4 (additionally):**
7. `closeSurvey()` contract call auto-refunds remaining USDC to creator's wallet

- Card updates to show "Closed" status and actions

### Manage Invites
Opens an inline panel or modal for invite-only surveys.

## Invite Management Panel

For surveys with `accessMode = INVITE_ONLY`. Opened via "Manage Invites" action on survey cards.

### Add Invites
- Text input field for email addresses or domains
- Auto-detects type: contains `@` = EMAIL invite, no `@` = DOMAIN invite
- Comma-separated bulk entry supported for emails
- "Add" button to submit
- Adding an EMAIL invite immediately triggers an invitation email to that address

### Current Invites List
- Shows all invites for the survey with type icon (email icon / domain icon)
- Remove button per invite (with confirmation for domain invites, as they may affect many users)
- Progress indicator: "X of Y invited have responded" (for EMAIL invites only — domain invites have no fixed count)

## Empty State

If the creator has no surveys, show a centered empty state:
- Message: "You haven't created any surveys yet."
- Prominent "Create Your First Survey" button

## tRPC Procedures

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `survey.listMine` | Query | Protected | Get all surveys by authenticated user with response counts |
| `survey.create` | Mutation | Protected | Create a new draft survey |
| `survey.deleteDraft` | Mutation | Protected | Hard delete a draft survey |
| `survey.close` | Mutation | Protected | Close a published survey, trigger email notifications |
| `survey.getStats` | Query | Protected | Get overview stats (total surveys, total responses, active count) |
| `invite.list` | Query | Protected | Get all invites for a survey |
| `invite.add` | Mutation | Protected | Add one or more invites (email or domain) |
| `invite.remove` | Mutation | Protected | Remove an invite |
| `invite.getProgress` | Query | Protected | Get invite response progress (X of Y responded) |
| `results.getForCreator` | Query | Protected | Get real-time results for a published survey (creator only) |

## Component Structure

```
DashboardPage (/dashboard)
├── OverviewStats
│   ├── StatCard (Surveys)
│   ├── StatCard (Responses)
│   └── StatCard (Active)
├── SurveyListHeader
│   ├── NewSurveyButton
│   ├── StatusFilterTabs (All / Draft / Published / Closed)
│   └── SortDropdown
├── SurveyList
│   └── SurveyCard (per survey)
│       ├── SurveyCardHeader (title, status badge, indicators)
│       ├── SurveyCardMeta (response count, dates, link)
│       ├── MiniChart (published surveys, first question result)
│       └── SurveyCardActions (status-specific action buttons)
├── InviteManagementPanel (modal/inline, for invite-only surveys)
│   ├── InviteInput (email/domain entry, bulk support)
│   ├── InviteList (current invites with remove buttons)
│   └── InviteProgress (X of Y responded)
└── EmptyState (when no surveys exist)
```
