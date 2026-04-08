"use client";

import { useCallback, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { AuthGuard } from "~/app/_components/auth-guard";
import { WizardShell } from "~/app/_components/wizard/wizard-shell";
import type { WizardShellStep } from "~/app/_components/wizard/wizard-shell";
import { api } from "~/trpc/react";
import type { RouterOutputs } from "~/trpc/react";
import { useSurveyBuilder } from "~/app/surveys/[id]/edit/_hooks/useSurveyBuilder";
import { StepBasics } from "./_components/step-basics";
import { StepQuestions } from "./_components/step-questions";
import { StepSettings } from "./_components/step-settings";
import { StepReview } from "./_components/step-review";

type SurveyForEdit = NonNullable<RouterOutputs["survey"]["getForEdit"]>;

const VALID_STEP_IDS = ["basics", "questions", "settings", "review"] as const;
type StepId = (typeof VALID_STEP_IDS)[number];

function isValidStepId(value: string | null): value is StepId {
  return VALID_STEP_IDS.includes(value as StepId);
}

function WizardPage({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawStep = searchParams.get("step");
  const initialStepId: StepId = isValidStepId(rawStep) ? rawStep : "basics";

  const { data: survey, isLoading, error } = api.survey.getForEdit.useQuery(
    { slug },
    { retry: false },
  );

  // -------------------------------------------------------------------------
  // Redirect published surveys away from editor
  // -------------------------------------------------------------------------
  if (!isLoading && survey && survey.status !== "DRAFT") {
    router.replace(`/s/${survey.slug}`);
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading survey…</p>
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="font-medium text-gray-700">Survey not found</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 text-sm text-blue-600 hover:underline"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <WizardEditor survey={survey} initialStepId={initialStepId} />
  );
}

function WizardEditor({
  survey: initialSurvey,
  initialStepId,
}: {
  survey: SurveyForEdit;
  initialStepId: StepId;
}) {
  const router = useRouter();
  const builder = useSurveyBuilder(initialSurvey);

  // -------------------------------------------------------------------------
  // onStepChange: save current state + update URL
  // -------------------------------------------------------------------------
  const handleStepChange = useCallback(
    async (_fromStepId: string, toStepId: string) => {
      await builder.saveCurrentState();
      router.replace(`?step=${toStepId}`, { scroll: false });
    },
    [builder, router],
  );

  // -------------------------------------------------------------------------
  // Derive hasErrors / isComplete from step validation
  // -------------------------------------------------------------------------
  const stepValidation = builder.getStepValidation();

  const basicsHasErrors = stepValidation.basics.length > 0;
  const questionsHasErrors = stepValidation.questions.length > 0;
  const settingsHasErrors = stepValidation.settings.length > 0;

  const basicsComplete = !basicsHasErrors;
  const questionsComplete = !questionsHasErrors && builder.questions.length > 0;
  const settingsComplete = !settingsHasErrors && builder.survey.categories.length > 0;

  // -------------------------------------------------------------------------
  // Step contents
  // -------------------------------------------------------------------------

  // goToStep helper passed to StepReview
  const goToStep = useCallback(
    (stepId: string) => {
      router.replace(`?step=${stepId}`, { scroll: false });
    },
    [router],
  );

  const steps: WizardShellStep[] = useMemo(
    () => [
      {
        id: "basics",
        label: "Basics",
        shortLabel: "Basics",
        enabled: true,
        hasErrors: basicsHasErrors,
        isComplete: basicsComplete,
        content: (
          <StepBasics
            survey={builder.survey}
            onUpdateField={builder.updateSurveyField}
          />
        ),
      },
      {
        id: "questions",
        label: "Questions",
        shortLabel: "Questions",
        enabled: true,
        hasErrors: questionsHasErrors,
        isComplete: questionsComplete,
        content: (
          <StepQuestions
            questions={builder.questions}
            validationErrors={builder.validationErrors}
            onUpdateQuestion={builder.updateQuestion}
            onAddQuestion={builder.addQuestion}
            onMoveQuestion={builder.moveQuestion}
            onDuplicateQuestion={builder.duplicateQuestion}
            onDeleteQuestion={builder.deleteQuestion}
          />
        ),
      },
      {
        id: "settings",
        label: "Settings",
        shortLabel: "Settings",
        enabled: true,
        hasErrors: settingsHasErrors,
        isComplete: settingsComplete,
        content: (
          <StepSettings
            survey={builder.survey}
            isPremium={builder.isPremium}
            onUpdateField={builder.updateSurveyField}
            onUpdateCategories={builder.updateCategories}
            onUpdateTags={builder.updateTags}
          />
        ),
      },
      {
        id: "review",
        label: "Review & Publish",
        shortLabel: "Review",
        enabled: true,
        hasErrors: false,
        isComplete: false,
        content: (
          <StepReview
            surveyId={builder.surveyId}
            survey={builder.survey}
            questions={builder.questions}
            validation={stepValidation}
            onGoToStep={goToStep}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      builder.survey,
      builder.questions,
      builder.validationErrors,
      builder.isPremium,
      stepValidation,
      basicsHasErrors,
      basicsComplete,
      questionsHasErrors,
      questionsComplete,
      settingsHasErrors,
      settingsComplete,
      goToStep,
    ],
  );

  return (
    <WizardShell
      steps={steps}
      initialStepId={initialStepId}
      onStepChange={handleStepChange}
    />
  );
}

export default function SurveyEditWizardPage() {
  const params = useParams<{ slug: string }>();

  return (
    <AuthGuard>
      <WizardPage slug={params.slug} />
    </AuthGuard>
  );
}
