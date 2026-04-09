"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { api } from "~/trpc/react";
import { hashSurvey, buildSurveyMessage } from "~/lib/eip712/hash";
import { signSurvey } from "~/lib/eip712/sign";
import { buildPublishSurveyTypedData } from "~/lib/eip712/domain";
import {
  QUESTION_TYPE_INDEX,
  type SurveyQuestion as EIP712SurveyQuestion,
} from "~/lib/eip712/types";
import type { SurveyState } from "~/app/surveys/[id]/edit/_hooks/useSurveyBuilder";
import type { QuestionDraft, ValidationError } from "~/app/surveys/[id]/edit/_lib/validation";

interface StepValidation {
  basics: ValidationError[];
  questions: ValidationError[];
  settings: ValidationError[];
}

interface StepReviewProps {
  surveyId: string;
  survey: SurveyState;
  questions: QuestionDraft[];
  validation: StepValidation;
  onGoToStep: (stepId: string) => void;
  isSaving?: boolean;
}

// Estimate reading / answering time (very rough: ~30s per question)
function estimatedMinutes(count: number): string {
  const seconds = count * 30;
  if (seconds < 60) return "< 1 min";
  const mins = Math.round(seconds / 60);
  return `~${mins} min`;
}

function ChecklistRow({
  label,
  errors,
  stepId,
  onGoToStep,
}: {
  label: string;
  errors: ValidationError[];
  stepId: string;
  onGoToStep: (stepId: string) => void;
}) {
  const hasErrors = errors.length > 0;
  return (
    <button
      type="button"
      onClick={() => onGoToStep(stepId)}
      className="flex w-full items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50"
    >
      <span
        className={[
          "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold",
          hasErrors
            ? "bg-red-100 text-red-600"
            : "bg-green-100 text-green-600",
        ].join(" ")}
      >
        {hasErrors ? "!" : "✓"}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={[
            "text-sm font-medium",
            hasErrors ? "text-red-700" : "text-gray-800",
          ].join(" ")}
        >
          {label}
        </p>
        {hasErrors && (
          <ul className="mt-1 space-y-0.5">
            {errors.map((e, i) => (
              <li key={i} className="text-xs text-red-600">
                {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <span className="ml-2 flex-shrink-0 text-xs text-gray-400">Edit →</span>
    </button>
  );
}

function QuestionPreview({ question, index }: { question: QuestionDraft; index: number }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-800">
        {index + 1}. {question.text || <span className="italic text-gray-400">(no text)</span>}
        {question.required && (
          <span className="ml-1 text-red-500">*</span>
        )}
      </p>

      {(question.questionType === "SINGLE_SELECT" ||
        question.questionType === "MULTIPLE_CHOICE") && (
        <ul className="ml-4 space-y-1">
          {question.options.map((opt, i) => (
            <li key={i} className="flex items-center gap-2">
              {question.questionType === "SINGLE_SELECT" ? (
                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-300" />
              ) : (
                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 border-gray-300" />
              )}
              <span className="text-sm text-gray-600">
                {opt || <span className="italic text-gray-400">(empty)</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {question.questionType === "RATING" && (
        <div className="ml-4 flex gap-1">
          {Array.from({
            length: (question.maxRating ?? 5) - (question.minRating ?? 1) + 1,
          }).map((_, i) => (
            <span
              key={i}
              className="flex h-7 w-7 items-center justify-center rounded border border-gray-300 text-xs text-gray-500"
            >
              {(question.minRating ?? 1) + i}
            </span>
          ))}
        </div>
      )}

      {question.questionType === "FREE_TEXT" && (
        <div className="ml-4">
          <textarea
            disabled
            placeholder="Respondent's answer…"
            rows={2}
            className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-400"
          />
          <p className="text-xs text-gray-400">
            Max {question.maxLength ?? 500} characters
          </p>
        </div>
      )}
    </div>
  );
}

export function StepReview({
  surveyId,
  survey,
  questions,
  validation,
  onGoToStep,
  isSaving,
}: StepReviewProps) {
  const router = useRouter();
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const [signingError, setSigningError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);

  const walletAddress = user?.wallet?.address;
  const walletReady = !!walletAddress;

  const publishMutation = api.survey.publish.useMutation({
    onSuccess: () => {
      router.push(`/s/${survey.slug}`);
    },
  });

  const totalErrors =
    validation.basics.length +
    validation.questions.length +
    validation.settings.length;
  const canPublish =
    totalErrors === 0 &&
    !publishMutation.isPending &&
    !isSigning &&
    !isSaving &&
    walletReady;

  const handlePublish = async () => {
    if (!walletAddress) return;
    setSigningError(null);
    setIsSigning(true);

    try {
      // Build EIP-712 survey message from form data
      const eip712Questions: EIP712SurveyQuestion[] = questions.map((q) => ({
        text: q.text,
        questionType: QUESTION_TYPE_INDEX[q.questionType] ?? 0,
        position: q.position,
        required: q.required,
        options: q.options,
        minRating: q.minRating ?? 0,
        maxRating: q.maxRating ?? 0,
        maxLength: q.maxLength ?? 0,
      }));

      const surveyMessage = buildSurveyMessage(
        {
          title: survey.title,
          description: survey.description,
          slug: survey.slug,
          isPrivate: survey.isPrivate,
          accessMode: survey.accessMode,
          resultsVisibility: survey.resultsVisibility,
        },
        walletAddress as `0x${string}`,
        eip712Questions,
      );

      const surveyHash = hashSurvey(surveyMessage);

      // Find the embedded wallet and get provider
      const embeddedWallet = wallets.find(
        (w) => w.address.toLowerCase() === walletAddress.toLowerCase(),
      );
      if (!embeddedWallet) {
        setSigningError("Wallet not found. Please try again.");
        setIsSigning(false);
        return;
      }
      const provider = await embeddedWallet.getEthereumProvider();

      // Sign the compact PublishSurvey typed data
      const signature = await signSurvey(provider, walletAddress as `0x${string}`, {
        surveyHash,
        title: survey.title,
        slug: survey.slug,
        questionCount: questions.length,
        creator: walletAddress as `0x${string}`,
      });

      // Call tRPC with signature
      publishMutation.mutate({
        id: surveyId,
        signature,
        surveyHash,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Signing failed";
      if (message.includes("rejected") || message.includes("denied")) {
        setSigningError("Signature rejected. Please try again.");
      } else {
        setSigningError(message);
      }
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Review &amp; Publish</h2>
        <p className="mt-1 text-sm text-gray-500">
          Check for any issues, preview your survey, then publish.
        </p>
      </div>

      {/* Validation checklist */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-gray-700">
          Validation checklist
        </h3>
        <div className="space-y-2">
          <ChecklistRow
            label="Basics (title & description)"
            errors={validation.basics}
            stepId="basics"
            onGoToStep={onGoToStep}
          />
          <ChecklistRow
            label="Questions"
            errors={validation.questions}
            stepId="questions"
            onGoToStep={onGoToStep}
          />
          <ChecklistRow
            label="Settings (categories & tags)"
            errors={validation.settings}
            stepId="settings"
            onGoToStep={onGoToStep}
          />
        </div>
      </section>

      {/* Respondent preview */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-gray-700">
          Respondent preview
        </h3>
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-6 shadow-sm">
          <h4 className="text-xl font-bold text-gray-900">
            {survey.title || (
              <span className="italic text-gray-400">Untitled Survey</span>
            )}
          </h4>
          {survey.description && (
            <p className="mt-2 text-sm text-gray-600">{survey.description}</p>
          )}
          <div className="mt-2 flex gap-3 text-xs text-gray-400">
            <span>
              {questions.length} question{questions.length !== 1 ? "s" : ""}
            </span>
            <span>·</span>
            <span>{estimatedMinutes(questions.length)}</span>
          </div>

          {questions.length > 0 && (
            <div className="mt-6 space-y-6 border-t border-gray-100 pt-6">
              {questions.map((q, i) => (
                <QuestionPreview key={q.id} question={q} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Publish */}
      <section className="relative">
        {(publishMutation.isError || signingError) && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {signingError ?? publishMutation.error?.message ?? "Failed to publish. Please try again."}
          </p>
        )}

        {!walletReady && (
          <p className="mb-3 text-xs text-amber-600">
            Wallet not ready. Please wait...
          </p>
        )}

        {isSaving && (
          <p className="mb-3 text-xs text-gray-500">
            Saving changes...
          </p>
        )}

        <button
          type="button"
          disabled={!canPublish}
          onClick={() => void handlePublish()}
          className={[
            "w-full rounded-xl px-6 py-3 text-base font-semibold transition-colors",
            canPublish
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "cursor-not-allowed bg-gray-200 text-gray-400",
          ].join(" ")}
        >
          {isSigning
            ? "Signing..."
            : publishMutation.isPending
              ? "Publishing..."
              : "Publish Survey"}
        </button>

        {totalErrors > 0 && (
          <p className="mt-2 text-center text-xs text-gray-500">
            Fix {totalErrors} issue{totalErrors !== 1 ? "s" : ""} above before
            publishing.
          </p>
        )}

        {/* Publishing overlay */}
        {(publishMutation.isPending || isSigning) && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
              {isSigning ? "Waiting for signature..." : "Publishing..."}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
