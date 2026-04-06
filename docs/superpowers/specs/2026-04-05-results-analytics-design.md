# Results & Analytics Design

## Overview

Results are displayed as basic per-question aggregations: bar charts for select questions, average + distribution for ratings, and paginated lists for free text. Results become available to the public/respondents when the survey closes. Creators can view real-time results from their dashboard while the survey is still open.

## Results Page (`/s/[slug]/results`)

### Access Control

Determined by `resultsVisibility` on the survey:

| resultsVisibility | Access | Auth Required |
|-------------------|--------|---------------|
| `PUBLIC` | Anyone | No |
| `RESPONDENTS` | Only users who submitted a response | Yes |
| `CREATOR` | Only the survey creator | Yes |

### Availability

- Results page shows "Results are not yet available" while survey status is PUBLISHED
- Results become accessible when survey status is CLOSED
- Exception: creator can always view real-time results from their dashboard (separate route)

### Private Survey + PUBLIC Results Invariant

Private surveys with `resultsVisibility = PUBLIC` show aggregated results only (bar charts, averages, distributions). The free text paginated list is **hidden** — individual free text responses are not displayed publicly for private surveys. Free text responses require at least `RESPONDENTS` visibility on private surveys. This prevents leaking individual answers through the results page while allowing the creator to share aggregate findings publicly.

### Page Layout

**Header:**
- Survey title
- Total response count
- Close date
- Verification badge (Phase 2+): "Verified on-chain" with link to block explorer

**Body:**
- Questions rendered in order, each as a distinct section
- Each section shows: question text, question type label, response count for that question
- Per-question visualization based on type (see below)

## Per-Question Visualizations

### Single Select

Horizontal bar chart showing each option with count and percentage.

- Bars are proportional to percentage
- Sorted by the original option order (not by popularity)
- Percentages sum to 100%
- Shows count and percentage per option
- Label: "(Single Select · N responses)"

### Multiple Choice

Horizontal bar chart showing each option with count and percentage of respondents who selected it.

- Bars are proportional to percentage
- Sorted by the original option order
- Percentages can exceed 100% (each option is independently calculated as: respondents who selected it / total respondents)
- Shows count and percentage per option
- Label: "(Multiple Choice · N responses)"

### Rating

Average score displayed prominently, plus a horizontal bar distribution showing count and percentage per rating value.

- Average displayed to one decimal place (e.g., "Average: 3.7")
- Distribution bars for each value from min to max
- Each bar shows count and percentage
- Label: "(Rating {min}-{max} · N responses)"

### Free Text

Paginated list of individual responses.

- 10 responses per page
- Sorted by submission time (newest first)
- Simple text display, no formatting
- Standard pagination controls (page numbers, previous/next)
- Label: "(Free Text · N responses)"

## Response Counts

- Each question shows its own response count independently
- Non-required questions may have fewer responses than the total survey response count
- No explicit "skipped" count — the difference between total responses and question responses makes this implicit

## Creator Real-Time Results

Creators can view results while the survey is still open, from their dashboard (separate route — covered in Creator Dashboard spec). The visualization is identical to the public results page. The only difference is access timing — creators don't need to wait for survey closure.

## tRPC Procedures

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `results.getBySurvey` | Query | Varies | Get aggregated results for a closed survey (access check by resultsVisibility) |
| `results.getForCreator` | Query | Protected | Get real-time results for creator's own survey (works while PUBLISHED or CLOSED) |
| `results.getQuestionAggregation` | Query | Varies | Get aggregation for a single question (used for lazy loading on large surveys) |

### Aggregation Query Structure

For select questions (SINGLE_SELECT, MULTIPLE_CHOICE):
```typescript
{
  questionId: string
  questionType: "SINGLE_SELECT" | "MULTIPLE_CHOICE"
  totalResponses: number
  options: {
    value: string
    count: number
    percentage: number
  }[]
}
```

For rating questions:
```typescript
{
  questionId: string
  questionType: "RATING"
  totalResponses: number
  average: number
  distribution: {
    value: number
    count: number
    percentage: number
  }[]
}
```

For free text questions:
```typescript
{
  questionId: string
  questionType: "FREE_TEXT"
  totalResponses: number
  responses: {
    value: string
    submittedAt: string
  }[]
  page: number
  totalPages: number
}
```

## Component Structure

```
ResultsPage (/s/[slug]/results)
├── ResultsHeader
│   ├── SurveyTitle
│   ├── ResponseCount
│   ├── CloseDate
│   └── VerificationBadge (Phase 2+)
├── ResultsAccessGate (checks resultsVisibility + auth)
└── QuestionResultsList
    └── QuestionResult (per question)
        ├── QuestionHeader (text, type label, response count)
        ├── BarChart (Single Select / Multiple Choice)
        ├── RatingResult (Rating — average + distribution)
        └── FreeTextList (Free Text — paginated)
```

## Performance Considerations

- Aggregations are computed server-side via SQL (COUNT, GROUP BY on the Answer table)
- For surveys with large response counts, consider caching aggregation results on survey close (since closed surveys are immutable, results never change)
- Free text pagination prevents loading all responses at once
- `results.getQuestionAggregation` enables lazy loading — load above-the-fold questions first, fetch others as user scrolls
