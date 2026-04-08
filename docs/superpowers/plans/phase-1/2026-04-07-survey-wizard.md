# Survey Creation Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-page survey editor with a 4-step wizard (Basics → Questions → Settings → Review & Publish) that defers DB creation until Step 1 completes.

**Architecture:** A `WizardShell` component manages step state and navigation. Each step is a standalone component receiving the survey state and callbacks. Step 1 lives at `/surveys/new` (no DB record). After "Next" on Step 1, the survey is created and the URL transitions to `/s/[slug]/edit`. Steps 2-4 live at `/s/[slug]/edit` with step state in a URL query param. Existing question editor components (QuestionCard, OptionsEditor, etc.) are reused. The old split-pane SurveyBuilderClient and PreviewPane are removed.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS, tRPC 11

---

## File Structure

### New files
- `src/app/_components/wizard/wizard-shell.tsx` — stepper navigation bar + step container
- `src/app/_components/wizard/wizard-stepper.tsx` — horizontal step indicators with ✓/⚠ status
- `src/app/s/[slug]/edit/_components/step-basics.tsx` — Step 1 form for editing existing survey title/description
- `src/app/s/[slug]/edit/_components/step-questions.tsx` — Step 2: full-width question editor
- `src/app/s/[slug]/edit/_components/step-settings.tsx` — Step 3: categories, tags, premium toggles
- `src/app/s/[slug]/edit/_components/step-review.tsx` — Step 4: validation checklist + respondent preview + publish

### Reused from existing builder
- `src/app/surveys/[id]/edit/_components/QuestionCard.tsx`
- `src/app/surveys/[id]/edit/_components/QuestionCardList.tsx`
- `src/app/surveys/[id]/edit/_components/AddQuestionButton.tsx`
- `src/app/surveys/[id]/edit/_components/OptionsEditor.tsx`
- `src/app/surveys/[id]/edit/_components/RatingConfig.tsx`
- `src/app/surveys/[id]/edit/_components/MaxLengthConfig.tsx`
- `src/app/surveys/[id]/edit/_lib/constants.ts`
- `src/app/surveys/[id]/edit/_lib/validation.ts`
- `src/app/surveys/[id]/edit/_hooks/useSurveyBuilder.ts` (modified)

### Removed (replaced by wizard)
- `src/app/surveys/[id]/edit/_components/SurveyBuilderClient.tsx`
- `src/app/surveys/[id]/edit/_components/PreviewPane.tsx`
- `src/app/surveys/[id]/edit/_components/BuilderHeader.tsx`
- `src/app/surveys/[id]/edit/_components/BuilderFooter.tsx`
- `src/app/surveys/[id]/edit/_components/PublishDialog.tsx`
- `src/app/surveys/[id]/edit/_components/SurveyMetadataForm.tsx`
- `src/app/surveys/[id]/edit/_hooks/useAutoSave.ts`

### Modified
- `src/app/surveys/new/page.tsx` — rewritten as wizard Step 1
- `src/app/s/[slug]/edit/page.tsx` — rewritten as wizard Steps 2-4
- `src/app/surveys/[id]/edit/page.tsx` — simplified to redirect
- `src/app/surveys/[id]/edit/_hooks/useSurveyBuilder.ts` — remove auto-save, add save-on-navigate + step validation
- `src/server/api/routers/survey.ts` — add description to create input

---

### Task 1: Create WizardStepper component

**Files:**
- Create: `src/app/_components/wizard/wizard-stepper.tsx`

- [ ] **Step 1: Create the stepper navigation component**

Create `src/app/_components/wizard/wizard-stepper.tsx`. Horizontal step indicators showing step label (desktop) or number (mobile). Each step shows status: ✓ (green, valid), ! (red, errors), number (blue, active), or number (gray, incomplete). Clickable when enabled and not current.

Props: `steps: WizardStep[]`, `currentStepId: string`, `onStepClick: (stepId: string) => void`.

`WizardStep` type: `{ id: string; label: string; shortLabel: string; status: "incomplete" | "valid" | "error" | "active"; enabled: boolean }`.

Uses Tailwind. Steps connected by gray lines on desktop.

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/wizard/wizard-stepper.tsx
git commit -m "feat: add WizardStepper component with step indicators"
```

---

### Task 2: Create WizardShell component

**Files:**
- Create: `src/app/_components/wizard/wizard-shell.tsx`

- [ ] **Step 1: Create the shell that manages step state and navigation**

Create `src/app/_components/wizard/wizard-shell.tsx`. Renders WizardStepper at top, current step content in the middle, Back/Next buttons at bottom.

Props: `steps` array (each with id, label, shortLabel, enabled, hasErrors, isComplete, content ReactNode), `initialStepId`, `onStepChange` callback (async, called before navigation — this is where save-on-navigate happens).

State: `currentStepId`. Methods: `navigateTo(stepId)` — checks enabled, calls `onStepChange`, updates state. `handleNext`/`handleBack` — navigate to adjacent step.

Bottom footer: "Back" button (invisible on first step), "Next" button (hidden on last step).

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/wizard/wizard-shell.tsx
git commit -m "feat: add WizardShell with step management and navigation"
```

---

### Task 3: Create Step 1 — Basics (new survey)

**Files:**
- Rewrite: `src/app/surveys/new/page.tsx`
- Modify: `src/server/api/routers/survey.ts`

- [ ] **Step 1: Update survey.create to accept optional description**

In `src/server/api/routers/survey.ts`, add `description` to the create input schema:

```typescript
create: protectedProcedure
  .input(
    z.object({
      title: z.string().min(1).max(200).optional().default("Untitled Survey"),
      description: z.string().max(2000).optional().default(""),
    }),
  )
```

Include `description: input.description` in the survey create data.

- [ ] **Step 2: Rewrite /surveys/new as wizard Step 1**

Rewrite `src/app/surveys/new/page.tsx`. Wrapped in AuthGuard. Shows a clean form with title (required, max 200) and description (optional, max 2000) fields. Character counters. Simple header showing "Create a New Survey — Step 1 of 4".

"Next" button: validates title is non-empty, calls `survey.create` mutation with title + description, on success redirects to `/s/[slug]/edit?step=questions`. Shows error if creation fails. Shows "Creating..." while pending.

No WizardShell on this page — it's a standalone page since the survey doesn't exist yet. The stepper UI only appears after Step 1 creates the DB record.

- [ ] **Step 3: Commit**

```bash
git add src/app/surveys/new/page.tsx src/server/api/routers/survey.ts
git commit -m "feat: rewrite /surveys/new as wizard Step 1 (Basics)"
```

---

### Task 4: Create Step components (Questions, Settings, Review)

**Files:**
- Create: `src/app/s/[slug]/edit/_components/step-basics.tsx`
- Create: `src/app/s/[slug]/edit/_components/step-questions.tsx`
- Create: `src/app/s/[slug]/edit/_components/step-settings.tsx`
- Create: `src/app/s/[slug]/edit/_components/step-review.tsx`

- [ ] **Step 1: Create StepBasics for editing existing survey title/description**

Create `src/app/s/[slug]/edit/_components/step-basics.tsx`. Same fields as /surveys/new (title + description) but for editing an existing survey. Receives `survey` state and `onUpdateField` callback. Full-width, centered, max-w-xl.

- [ ] **Step 2: Create StepQuestions**

Create `src/app/s/[slug]/edit/_components/step-questions.tsx`. Full-width question editor. Imports and renders `QuestionCardList` and `AddQuestionButton` from `~/app/surveys/[id]/edit/_components/`. Receives questions array and all question CRUD callbacks (update, add, delete, move, duplicate). Shows heading "Questions" with count guidance ("Add between 1 and 100 questions"). No split-pane, no preview.

- [ ] **Step 3: Create StepSettings**

Create `src/app/s/[slug]/edit/_components/step-settings.tsx`. Categories multi-select (pills from SURVEY_CATEGORIES, 1-5), tags input (enter-to-add, max 10, with removal), private toggle (premium gated), invite-only toggle (premium gated), results visibility dropdown (premium options disabled for free). Receives `survey` state, `isPremium`, and field update callbacks.

- [ ] **Step 4: Create StepReview**

Create `src/app/s/[slug]/edit/_components/step-review.tsx`. Three sections:

1. **Validation checklist** — one row per step (Basics, Questions, Settings). Each shows ✓ or ! with error list. Clicking a row calls `onGoToStep(stepId)`.
2. **Respondent preview** — read-only rendering of the survey: title, description, question count + estimated time, each question rendered with its type (radio buttons for single select, checkboxes for multiple choice, numbered scale for rating, text area for free text).
3. **Publish button** — disabled when errors exist. Calls `survey.publish` mutation. Shows publishing overlay. On success redirects to `/s/[slug]`.

- [ ] **Step 5: Commit**

```bash
git add src/app/s/[slug]/edit/_components/
git commit -m "feat: add wizard step components (Basics, Questions, Settings, Review)"
```

---

### Task 5: Update useSurveyBuilder for wizard pattern

**Files:**
- Modify: `src/app/surveys/[id]/edit/_hooks/useSurveyBuilder.ts`

- [ ] **Step 1: Refactor the hook for save-on-navigate**

Read the current `useSurveyBuilder.ts`. Modify it to:

1. Remove `surveyDirty`, `dirtyQuestionIds`, `setSurveyDirty`, `setDirtyQuestionIds` from the return value
2. Add `saveCurrentState(): Promise<void>` — calls `survey.update` with all current metadata fields + loops through all questions calling `question.upsert` for each. This replaces the debounced auto-save. Called by WizardShell's `onStepChange`.
3. Add `getStepValidation()` — returns `{ basics: ValidationError[], questions: ValidationError[], settings: ValidationError[] }` by categorizing the full validation result.
4. Keep all existing methods: `updateSurveyField`, `updateCategories`, `updateTags`, `updateQuestion`, `addQuestion`, `moveQuestion`, `duplicateQuestion`, `deleteQuestion`, `handlePublish`, `confirmPublish`.
5. Expose `surveyId` (already added in previous fix).

- [ ] **Step 2: Verify typecheck**

```bash
SKIP_ENV_VALIDATION=1 pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/app/surveys/[id]/edit/_hooks/useSurveyBuilder.ts
git commit -m "refactor: update useSurveyBuilder for wizard save-on-navigate"
```

---

### Task 6: Rewrite the edit page as a wizard

**Files:**
- Rewrite: `src/app/s/[slug]/edit/page.tsx`

- [ ] **Step 1: Rewrite as wizard with Steps 1-4**

Rewrite `src/app/s/[slug]/edit/page.tsx`. Client component wrapped in AuthGuard.

1. Fetch survey via `api.survey.getForEdit.useQuery({ slug })`.
2. Initialize `useSurveyBuilder(survey)`.
3. Read `?step=` from URL search params (default to "basics"). Map to step IDs: "basics", "questions", "settings", "review".
4. Render `WizardShell` with 4 steps:
   - Step "basics": `<StepBasics>` — enabled always
   - Step "questions": `<StepQuestions>` — enabled always (survey exists)
   - Step "settings": `<StepSettings>` — enabled always
   - Step "review": `<StepReview>` — enabled always
5. `onStepChange` callback: calls `builder.saveCurrentState()` to persist before navigating. Updates URL search param `?step=`.
6. Each step's `hasErrors` and `isComplete` derived from `builder.getStepValidation()`.

- [ ] **Step 2: Update /surveys/[id]/edit/page.tsx to redirect**

Simplify `src/app/surveys/[id]/edit/page.tsx` to fetch the survey by ID and redirect to `/s/[slug]/edit`.

- [ ] **Step 3: Verify typecheck**

```bash
SKIP_ENV_VALIDATION=1 pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/app/s/[slug]/edit/page.tsx src/app/surveys/[id]/edit/page.tsx
git commit -m "feat: rewrite survey editor as 4-step wizard"
```

---

### Task 7: Remove old builder components

**Files:**
- Remove: 7 files (see File Structure above)

- [ ] **Step 1: Delete replaced files**

```bash
rm src/app/surveys/[id]/edit/_components/SurveyBuilderClient.tsx
rm src/app/surveys/[id]/edit/_components/PreviewPane.tsx
rm src/app/surveys/[id]/edit/_components/BuilderHeader.tsx
rm src/app/surveys/[id]/edit/_components/BuilderFooter.tsx
rm src/app/surveys/[id]/edit/_components/PublishDialog.tsx
rm src/app/surveys/[id]/edit/_components/SurveyMetadataForm.tsx
rm src/app/surveys/[id]/edit/_hooks/useAutoSave.ts
```

- [ ] **Step 2: Fix any broken imports**

```bash
grep -r "SurveyBuilderClient\|PreviewPane\|BuilderHeader\|BuilderFooter\|PublishDialog\|SurveyMetadataForm\|useAutoSave" src/ --include="*.tsx" --include="*.ts"
```

Fix any remaining references.

- [ ] **Step 3: Typecheck + test**

```bash
SKIP_ENV_VALIDATION=1 pnpm typecheck && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old single-page builder components"
```

---

### Task 8: Final verification

- [ ] **Step 1: Typecheck + tests**

```bash
SKIP_ENV_VALIDATION=1 pnpm typecheck && pnpm test
```

- [ ] **Step 2: Manual verification**

- `/surveys/new` → Step 1 with title + description
- "Next" without title → error
- "Next" with title → creates survey, redirects to `/s/[slug]/edit?step=questions`
- Stepper shows 4 steps, Step 1 ✓, Step 2 active
- Add/edit/delete/reorder questions on Step 2
- "Next" → saves, moves to Step 3
- Categories, tags, premium toggles on Step 3
- Step 4: validation checklist + preview + publish
- Clicking failed checklist item jumps to step
- Publish disabled with errors, enabled when clean
- Publishing redirects to `/s/[slug]`
- Returning to `/s/[slug]/edit` shows wizard with existing data
- Steps 2-4 freely navigable
- Mobile: numbered dots

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "feat: complete survey creation wizard"
```
