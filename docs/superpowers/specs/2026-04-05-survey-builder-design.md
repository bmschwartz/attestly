# Survey Builder Design

## Overview

The survey builder is the core creator experience — a split-pane editor where creators build surveys with a live preview. Auto-saves on every change. Supports four question types with type-specific configuration forms.

## Page Layout

Split-pane layout at route `/surveys/[id]/edit` (protected — creator only):

- **Left pane (Editor):** Survey title, description, and a vertical list of question cards. "Add Question" button at the bottom.
- **Right pane (Live Preview):** Real-time rendering of the survey as a respondent would see it. Updates instantly as the creator types.
- **Header:** "Survey Builder" title, save status indicator ("Saving..." / "All changes saved"), and "Publish" button.
- **Footer:** Question count and survey status (Draft).

## Survey Metadata

At the top of the editor pane:

- **Title** — text input, required, max 200 characters
- **Description** — textarea, required, max 2000 characters
- **Slug** — auto-generated from title (slugified), editable by creator. Uniqueness validated on publish.
- **Private toggle** — checkbox, sets `isPrivate` on the survey. Premium feature — visible to all users but gated for free tier. Free users see the toggle with a lock icon and tooltip: "Make responses private and control who sees results — available on Premium"
- **Invite-only toggle** — checkbox, sets `accessMode` to `INVITE_ONLY`. Premium feature — visible with lock icon and tooltip: "Restrict responses to invited participants — available on Premium"
- **Results visibility** — dropdown (Public / Respondents Only / Creator Only), sets `resultsVisibility`. "Respondents Only" and "Creator Only" are premium — free users see them as disabled options with: "Control who sees your results — available on Premium"
- **Categories** — multi-select from fixed platform list (Business, Education, Research, Health, Technology, Politics, Entertainment, Science, Community, Other). 1-5 required before publish.
- **Tags** — freeform text input, comma-separated or enter-to-add. 0-10 tags. Auto-lowercased and trimmed. Optional.

## Add Question Flow

Type-first: creator clicks "Add Question," a menu appears with four options:

1. Single Select
2. Multiple Choice
3. Rating
4. Free Text

Selecting a type creates a new question card at the bottom of the list with the appropriate form fields pre-configured.

## Question Card

Each question type renders as a card in the editor pane with:

### Common fields (all types)
- **Question text** — text input, required
- **Required toggle** — checkbox, whether respondents must answer
- **Card controls** (bottom-right):
  - [up arrow] — move question up in order
  - [down arrow] — move question down in order
  - [duplicate] — duplicate this question (copies all fields, appends to bottom)
  - [delete] — remove question (confirmation prompt if question has content)

### Type-specific fields

| Type | Additional Fields |
|------|-------------------|
| **Single Select** | Options list: each option is a text input with a remove button. "Add option" button at the bottom. Minimum 2 options. |
| **Multiple Choice** | Same as Single Select — options list with add/remove. Minimum 2 options. |
| **Rating** | Min value (integer input, default 1), Max value (integer input, default 5). Min must be less than max. |
| **Free Text** | Max length (integer input, default 500). Must be greater than 0. |

### Question type indicator
Each card displays the question type as a label/badge at the top of the card (e.g., "Single Select"). The type is set at creation and cannot be changed — if the creator wants a different type, they delete the question and add a new one.

## Live Preview

The right pane renders the survey exactly as a respondent would see it:

- Survey title and description at the top
- Questions rendered in order with their position number
- Single Select: radio buttons with option labels
- Multiple Choice: checkboxes with option labels
- Rating: star/number scale from min to max
- Free Text: text input/textarea with character count showing max length
- Required questions marked with an indicator

The preview updates in real-time as the creator edits fields in the left pane. The preview is read-only — no interaction (it's a visual reference, not a functional form).

## Auto-Save

- Every change (keystroke, toggle, option add/remove, reorder) triggers a debounced save
- Debounce delay: 1-2 seconds after last change
- Save status indicator in the header:
  - "All changes saved" (default state)
  - "Saving..." (during save)
  - "Save failed" (on error, with retry)
- Saves the full survey state (title, description, slug, isPrivate, all questions with their fields) via a tRPC mutation
- No explicit "Save Draft" button — saving is automatic

## Publish Flow

1. Creator clicks "Publish" button in the header
2. Client-side validation runs (see validation rules below)
3. If validation fails: inline error messages appear on the offending fields/questions, publish is blocked
4. If validation passes: confirmation dialog — "Publishing makes this survey permanent and immutable. You will not be able to edit it after publishing. Continue?"
5. On confirm: tRPC mutation transitions survey status to PUBLISHED, sets `publishedAt` timestamp
6. Creator is redirected to the published survey view or a success page with the shareable link

## Validation Rules (enforced before publish)

| Rule | Error Message |
|------|---------------|
| Survey must have a title (max 200 chars) | "Survey title is required" / "Title must be under 200 characters" |
| Survey must have a description (max 2000 chars) | "Survey description is required" / "Description must be under 2000 characters" |
| Survey must have 1-100 questions | "Survey must have at least 1 question" / "Survey cannot have more than 100 questions" |
| Every question must have text | "Question {n} is missing text" |
| Single Select / Multiple Choice must have at least 2 options | "Question {n} must have at least 2 options" |
| All options must be non-empty | "Question {n} has an empty option" |
| No duplicate options within a question | "Question {n} has duplicate options" |
| Rating min must be less than max | "Question {n}: min rating must be less than max" |
| Free Text maxLength must be > 0 | "Question {n}: max length must be greater than 0" |
| Survey must have 1-5 categories | "Select at least 1 category" / "Maximum 5 categories" |
| Tags must be 10 or fewer | "Maximum 10 tags" |
| Slug must be unique | "This URL slug is already taken" |

Validation runs client-side for immediate feedback. The server re-validates on the publish mutation to prevent bypass.

## Question Reordering

- Up/down arrow buttons on each question card
- First question hides the up arrow; last question hides the down arrow
- Reordering updates the `position` field on affected questions
- Preview updates immediately to reflect new order
- Reorder triggers auto-save

## Question Duplication

- Duplicate button creates an exact copy of the question (text, type, options, validation settings)
- Duplicate is inserted at the bottom of the question list
- Position is auto-assigned as the next available position
- Duplicate triggers auto-save

## Question Deletion

- Delete button on each question card
- If question has content (text, options), show confirmation: "Delete this question?"
- If question is empty, delete immediately without confirmation
- Deleting a question reindexes positions of subsequent questions
- Delete triggers auto-save

## tRPC Procedures

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `survey.create` | Mutation | Protected | Create a new draft survey, returns survey ID |
| `survey.update` | Mutation | Protected | Auto-save: update title, description, slug, isPrivate |
| `survey.publish` | Mutation | Protected | Validate and transition to PUBLISHED |
| `survey.deleteDraft` | Mutation | Protected | Hard delete a DRAFT survey (only drafts, never published/closed) |
| `survey.getForEdit` | Query | Protected | Get full survey with questions for the editor (creator only) |
| `question.upsert` | Mutation | Protected | Create or update a question (used by auto-save) |
| `question.delete` | Mutation | Protected | Delete a question and reindex positions |
| `question.reorder` | Mutation | Protected | Update positions after reorder |

## Component Structure

```
SurveyBuilderPage
├── BuilderHeader (title, save status, publish button)
├── SplitPane
│   ├── EditorPane
│   │   ├── SurveyMetadataForm (title, description, slug, isPrivate, accessMode, resultsVisibility, categories, tags)
│   │   ├── QuestionCardList
│   │   │   └── QuestionCard (one per question)
│   │   │       ├── QuestionHeader (type badge, controls)
│   │   │       ├── QuestionTextField
│   │   │       ├── OptionsEditor (Single Select / Multiple Choice)
│   │   │       ├── RatingConfig (Rating)
│   │   │       ├── MaxLengthConfig (Free Text)
│   │   │       └── RequiredToggle
│   │   └── AddQuestionButton + TypePickerMenu
│   └── PreviewPane
│       └── SurveyPreview (read-only respondent view)
└── BuilderFooter (question count, status)
```

## Additional Decisions

### Slug Generation
- Auto-generated from title with a random 4-character suffix always appended (e.g., `employee-survey-x7k2`)
- Creator can manually edit the slug to any unique value
- Uniqueness validated on publish

### Draft Deletion
- Creators can hard-delete DRAFT surveys (confirmation: "Delete this draft? This cannot be undone.")
- Published and closed surveys can never be deleted — they have responses and potentially on-chain records

### Rating UI
- Rendered as numbered buttons (e.g., `[1] [2] [3] [4] [5]`) for ranges up to 10
- For ranges > 10, rendered as a number input field
- Numbered buttons work for arbitrary min/max ranges, unlike stars which imply 1-5 quality

### Mobile Responsiveness
- Survey builder is desktop-optimized (split-pane layout)
- On mobile, the split-pane collapses to a tabbed view: editor tab / preview tab toggle
- Respondent-facing pages (landing, response, confirmation, results) are mobile-first
