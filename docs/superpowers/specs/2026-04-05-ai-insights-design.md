# AI Insights Design

## Overview

AI Insights is a premium feature that adds LLM-powered analysis to survey results. Two capabilities: auto-generated summaries (top-level overview + per free-text question) and a chat sidebar for asking natural language questions about the data.

## Feature Scope

- **Auto-generated summaries** — top-level survey overview + per free-text question summaries
- **Single-survey chat** — sidebar chat on the results page, scoped to one survey
- **Cross-survey chat** — select multiple surveys from the dashboard, chat with combined data for trend analysis and comparison

## Auto-Generated Summaries

### When Generated

- **On survey close:** a `GENERATE_AI_SUMMARY` BackgroundJob is queued when the creator closes a survey. The job runs asynchronously — calls the Claude API for the top-level summary and each free-text question summary, writes results to the AiSummary table. LLM calls can take 10-30+ seconds per summary, so this must not block the close mutation.
- **Job chaining:** `survey.close` mutation → queues `CLOSE_SURVEY` job (blockchain, Phase 2+) + `SEND_EMAIL` jobs (notifications) + `GENERATE_AI_SUMMARY` job (if premium)
- **Results page UX while generating:** shows "Generating AI summary..." placeholder with a spinner where the summary will appear. Auto-refreshes or polls until the job completes and the AiSummary record is created.
- **On demand:** creator can regenerate any summary with an optional focus prompt ("Focus on negative sentiment", "Highlight themes about remote work"). Regeneration also queued as a `GENERATE_AI_SUMMARY` job.
- **Retroactive on upgrade:** if a user upgrades to Premium after a survey has already closed (and no summaries were generated because they were free at close time), summaries are generated retroactively. On upgrade, check for closed surveys without AiSummary records and queue `GENERATE_AI_SUMMARY` jobs for each.

### Top-Level Summary

Displayed at the top of the results page, above the per-question breakdowns.

```
┌──────────────────────────────────────────────────┐
│  🤖 AI Summary                    [Regenerate]  │
│                                                  │
│  Key Findings:                                   │
│  • 70% of respondents report positive job        │
│    satisfaction, but work-life balance scores     │
│    lag significantly (avg 2.8/5)                  │
│  • Free text responses reveal a strong theme     │
│    around overtime expectations, cited by 45%     │
│    of commenters                                 │
│  • Benefits satisfaction is high, with health     │
│    insurance and remote work as top priorities    │
│                                                  │
│  Overall Sentiment: Positive with concerns       │
└──────────────────────────────────────────────────┘
```

**Content structure:**
- Key findings (3-5 bullet points)
- Overall sentiment assessment
- Notable patterns or correlations across questions
- Surprises or outliers

**LLM prompt context includes:**
- Survey title and description
- All questions with their types
- Aggregated results for select/rating questions (counts, percentages, averages)
- All free text responses

### Per-Question Summaries (Free Text Only)

Displayed below the free text response list for each free text question. Other question types (select, rating) do not get LLM summaries — their charts are self-explanatory.

```
┌──────────────────────────────────────────────────┐
│  4. Any additional comments?                     │
│     (Free Text · 312 responses)                  │
│                                                  │
│  "I think the team culture is great but..."      │
│  "More flexible hours would really help..."      │
│  "The onboarding process needs work..."          │
│  ...                                             │
│  Showing 1-10 of 312    [1] [2] [3] ... [32]    │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  🤖 Summary                [Regenerate] │    │
│  │                                          │    │
│  │  Top themes:                             │    │
│  │  • Overtime & work hours (45% of resp.)  │    │
│  │  • Positive team culture (38%)           │    │
│  │  • Onboarding improvements needed (22%)  │    │
│  │                                          │    │
│  │  Sentiment: Mixed — positive about       │    │
│  │  culture, negative about workload        │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

**Content structure:**
- Top themes with approximate frequency
- Sentiment breakdown
- Notable quotes or patterns

### Regeneration

- "Regenerate" button on each summary (top-level and per-question)
- Clicking opens a small input: "Focus on... (optional)" with a "Regenerate" confirm button
- Empty focus = general regeneration
- With focus = steered analysis (e.g., "Focus on negative feedback", "What do people say about management?")
- Regeneration replaces the existing summary
- Previous summaries are not versioned — latest only

### Storage

Summaries are stored in the database for instant page load:

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| surveyId | UUID | FK -> Survey |
| questionId | UUID? | FK -> Question. Null for top-level summary. |
| content | String | The generated summary text (markdown) |
| focusPrompt | String? | The focus prompt used for regeneration, null for auto-generated |
| generatedAt | DateTime | When this summary was generated |

**Table name:** `AiSummary`

**Unique constraint:** (surveyId, questionId) — one summary per question, one top-level per survey (questionId = null).

## Chat With Your Data

### UI: Sidebar Chat

Collapsible chat panel on the right side of the results page. Available to the survey creator on closed surveys with AI Insights enabled.

```
┌────────────────────────────────┬─────────────────────┐
│                                │  💬 Ask about data  │
│  Results Page                  │                     │
│  (charts, summaries, etc.)     │  ┌───────────────┐  │
│                                │  │ What did       │  │
│                                │  │ respondents    │  │
│                                │  │ who rated <3   │  │
│                                │  │ say in their   │  │
│                                │  │ comments?      │  │
│                                │  └───────────────┘  │
│                                │                     │
│                                │  Those who rated    │
│                                │  work-life balance  │
│                                │  below 3 primarily  │
│                                │  mentioned...       │
│                                │                     │
│                                │  ┌───────────────┐  │
│                                │  │ Type a question│  │
│                                │  └───────────────┘  │
└────────────────────────────────┴─────────────────────┘
```

### Behavior

- **Toggle:** button in the results page header to open/close the sidebar. Collapsed by default.
- **Session picker:** dropdown at the top of the sidebar showing all sessions for this survey. Creator can switch sessions or create a new one ("+ New session"). Sessions are titled auto-generated from the first message, editable.
- **Persistence:** messages stored server-side in ChatSession table. Creator can close the tab, switch devices, and resume where they left off. Sessions persist indefinitely.
- **Context:** full survey data is provided to the LLM — questions, aggregated results, and all responses (including free text). For very large surveys, responses may be summarized or chunked.
- **Conversation:** multi-turn chat with history preserved for the session. History is not persisted across page loads.
- **Streaming:** responses stream in real-time for perceived speed.
- **Grounded answers:** the LLM is instructed to only answer based on the survey data. If asked something unrelated, it responds: "I can only answer questions about this survey's data."

### Example Queries

- "What are the main complaints?"
- "How do people who selected 'Dissatisfied' on Q1 describe their experience in the comments?"
- "Summarize the top 3 themes from the free text responses"
- "What percentage of respondents are positive about remote work?"
- "Is there a pattern between low ratings and specific comment themes?"

### LLM Provider & Cost Model

- **Provider-agnostic architecture** — AI layer abstracted behind a service interface, swappable without spec changes
- **Leading candidate:** Gemini Flash-Lite for summaries (~$0.09 to fully analyze a 100-response survey with 20 free text questions), Gemini Flash for chat
- **Cost is low enough that no credit system is needed** — summaries and chat included in Premium with generous limits
- **Benchmark quality** during implementation and swap providers if needed

### Context Management

For surveys with many responses, the full dataset may exceed LLM context limits. Strategy:

1. **Always include:** survey metadata, all questions, aggregated results (counts/percentages/averages)
2. **< 500 free text responses per question:** include all verbatim
3. **500-2,000 per question:** stratified sample of 500 + auto-generated per-question summaries for remainder
4. **2,000+ per question:** per-question summaries only + representative sample of 200
5. **Reference in answers:** if the LLM used a sample, note "Based on a sample of N responses"
6. **Context caching:** for per-question summaries, the response dataset is identical across calls. Use provider context caching (e.g., Gemini context caching at 10x cheaper than input) to avoid re-sending the same data.

**Cross-survey chat:** same per-survey budget applied to each selected survey. Max 5 surveys selected simultaneously.

### Cross-Survey Chat

Accessible from the creator dashboard. Route: `/dashboard/insights`.

```
┌──────────────────────────────────────────────────────┐
│  Attestly    Explore  Dashboard  My Responses [Avtr] │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Cross-Survey Insights                               │
│                                                      │
│  Select surveys to analyze:                          │
│  ┌────────────────────────────────────────────────┐  │
│  │ ☑ Employee Satisfaction Q1 (423 responses)     │  │
│  │ ☑ Employee Satisfaction Q2 (512 responses)     │  │
│  │ ☐ Product Feedback (234 responses)             │  │
│  │ ☐ Onboarding Survey (156 responses)            │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ How did satisfaction change between Q1 and Q2? │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Overall satisfaction improved from 62% to 70%       │
│  positive between Q1 and Q2. The biggest shift was   │
│  in work-life balance ratings, which improved from   │
│  2.8 to 3.4 average. Free text themes shifted from   │
│  overtime complaints (45% in Q1) to appreciation     │
│  for the new flexible hours policy (38% in Q2)...    │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ Type a question...                             │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

- Full-page chat interface (not a sidebar — cross-survey analysis deserves full width)
- Creator selects 2+ closed surveys from a checklist of their surveys
- Each survey's data loaded as separate labeled context sections
- Multi-turn conversation with streaming responses
- Chat history persisted per session (not across page loads)
- Example queries:
  - "How did satisfaction change between Q1 and Q2?"
  - "Which themes appear in both surveys?"
  - "Compare the rating distributions across all selected surveys"
  - "What new concerns appeared in Q2 that weren't in Q1?"

## Access Control

- AI Insights is a **premium feature** — only available on paid tiers
- Auto-generated summaries appear on the results page for premium surveys only
- Chat sidebar only available to the survey creator (not respondents or public viewers)
- For non-premium surveys, upsells are **visible but gated** — show the feature slot with a specific value proposition:
  - **Summary upsell:** blurred/placeholder card where the AI summary would be: "AI found N key insights from your N free text responses. Upgrade to read them."
  - **Chat upsell:** disabled chat toggle button with tooltip: "Chat with your survey data — available on Premium"
  - **Cross-survey upsell:** "Cross-Survey Insights" link visible on dashboard with a premium badge, gated on click

## LLM Integration

### Provider

Use the Claude API (Anthropic) for summary generation and chat.

### Implementation

- **Summaries:** single API call per summary (top-level or per-question). System prompt instructs structured output (key findings, sentiment, themes).
- **Chat:** streaming API call. System prompt includes the survey data as context. Multi-turn conversation maintained client-side and sent with each request.
- **Rate limiting:** limit regeneration to prevent abuse (e.g., max 10 regenerations per survey per day). Chat messages rate-limited per user.

## tRPC Procedures

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `ai.getSummaries` | Query | Protected | Get all summaries for a survey (top-level + per-question) |
| `ai.regenerateSummary` | Mutation | Protected | Regenerate a specific summary with optional focus prompt |
| `ai.chat` | Mutation | Protected | Send message to a chat session, returns streaming response, appends to session |
| `ai.getSession` | Query | Protected | Get a specific chat session by ID (messages + metadata) |
| `ai.listSessions` | Query | Protected | List all chat sessions for a survey (or cross-survey sessions) |
| `ai.createSession` | Mutation | Protected | Start a new chat session for a survey or cross-survey |
| `ai.renameSession` | Mutation | Protected | Update session title |
| `ai.deleteSession` | Mutation | Protected | Delete a chat session |

## Data Model Additions

### AiSummary table

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| surveyId | UUID | FK -> Survey | |
| questionId | UUID? | FK -> Question | Null for top-level summary |
| content | String | | Generated summary (markdown) |
| focusPrompt | String? | | Optional focus used for regeneration |
| generatedAt | DateTime | | |

**Unique constraint:** (surveyId, questionId) — one active summary per scope.

### ChatSession table

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | UUID | PK | |
| userId | UUID | FK -> User | Session owner |
| surveyId | UUID? | FK -> Survey | Null for cross-survey chat |
| surveyIds | Json? | | Array of survey IDs for cross-survey chat. Null for single-survey. |
| title | String | | Auto-generated from first message, editable by user |
| messages | Json | | Array of `{role: "user"|"assistant", content: string, timestamp: string}` |
| createdAt | DateTime | | |
| updatedAt | DateTime | | Updated on each new message |

Sessions persist indefinitely. Multiple sessions per survey allowed. On premium downgrade, sessions are preserved but gated — re-subscribe to regain access.

## Component Structure

```
ResultsPage (updated)
├── ResultsHeader
│   └── ChatToggleButton
├── AiSummaryCard (top-level, premium only)
│   ├── SummaryContent (markdown)
│   └── RegenerateButton + FocusInput
├── QuestionResultsList
│   └── QuestionResult
│       ├── (existing chart components)
│       └── AiSummaryCard (free text questions only)
├── ChatSidebar (collapsible, premium only)
│   ├── ChatHistory
│   │   └── ChatMessage (user/assistant alternating)
│   ├── ChatInput
│   └── StreamingIndicator
└── PremiumUpsell (shown for non-premium surveys)

CrossSurveyInsightsPage (/dashboard/insights)
├── SurveySelector (checklist of creator's closed surveys)
├── ChatInterface (full-width)
│   ├── ChatHistory
│   │   └── ChatMessage (user/assistant alternating)
│   ├── ChatInput
│   └── StreamingIndicator
```
