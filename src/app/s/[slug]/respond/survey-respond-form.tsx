"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { api } from "~/trpc/react";
import { useAutoSave } from "~/hooks/use-auto-save";
import { SingleSelectInput } from "~/app/_components/inputs/single-select-input";
import { MultipleChoiceInput } from "~/app/_components/inputs/multiple-choice-input";
import { RatingInput } from "~/app/_components/inputs/rating-input";
import { FreeTextInput } from "~/app/_components/inputs/free-text-input";
import { useRouter } from "next/navigation";
import { hashAnswers } from "~/lib/eip712/hash";
import { computeBlindedId } from "~/lib/eip712/blinded-id";
import { signSurveyResponse } from "~/lib/eip712/sign";
import { QUESTION_TYPE_INDEX, type ResponseAnswer } from "~/lib/eip712/types";

interface Question {
  id: string;
  text: string;
  type: "SINGLE_SELECT" | "MULTIPLE_CHOICE" | "RATING" | "FREE_TEXT";
  required: boolean;
  index: number;
  options: string[] | null;
  minRating: number | null;
  maxRating: number | null;
  maxLength: number | null;
}

interface SurveyRespondFormProps {
  surveyId: string;
  surveyTitle: string;
  slug: string;
  contentHash: string | null;
  questions: Question[];
}

export function SurveyRespondForm({
  surveyId,
  surveyTitle,
  slug,
  contentHash,
  questions,
}: SurveyRespondFormProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const { user } = usePrivy();
  const { wallets } = useWallets();

  // --- Response lifecycle ---
  const [responseId, setResponseId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [unansweredRequired, setUnansweredRequired] = useState<Set<string>>(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [surveyClosed, setSurveyClosed] = useState(false);
  const questionRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const saveAnswerMutation = api.response.saveAnswer.useMutation();
  const submitMutation = api.response.submit.useMutation();
  const clearMutation = api.response.clear.useMutation();
  const startMutation = api.response.start.useMutation();

  // --- Start or resume the response on mount ---
  useEffect(() => {
    async function initResponse() {
      try {
        const response = await startMutation.mutateAsync({ surveyId });
        setResponseId(response.id);
        if (response.answers && Array.isArray(response.answers)) {
          const existingAnswers = new Map<string, string>();
          for (const answer of response.answers as { questionId: string; value: string }[]) {
            existingAnswers.set(answer.questionId, answer.value);
          }
          setAnswers(existingAnswers);
        }
      } catch (error: unknown) {
        const trpcError = error as { data?: { code?: string }; message?: string };
        if (trpcError.data?.code === "FORBIDDEN") {
          setStartError("This survey has reached its response limit.");
        } else if (trpcError.data?.code === "NOT_FOUND") {
          setStartError("You are not invited to this survey.");
        } else {
          setStartError(trpcError.message ?? "Something went wrong.");
        }
      }
    }
    void initResponse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  // --- Poll survey status to detect mid-response close ---
  useEffect(() => {
    const interval = setInterval(() => {
      void (async () => {
        try {
          const survey = await utils.survey.getBySlug.fetch({ slug });
          if (survey?.status === "CLOSED") {
            setSurveyClosed(true);
            clearInterval(interval);
          }
        } catch {
          // Ignore polling errors silently
        }
      })();
    }, 30_000);
    return () => clearInterval(interval);
  }, [slug, utils]);

  // --- Auto-save wiring ---
  const handleSaveAnswer = useCallback(
    async (questionId: string, value: string) => {
      if (!responseId) return;
      const question = questions.find((q) => q.id === questionId);
      if (!question) return;
      await saveAnswerMutation.mutateAsync({
        responseId,
        questionId,
        questionIndex: question.index,
        questionType: question.type,
        value,
      });
    },
    [responseId, questions, saveAnswerMutation],
  );

  const { save: debouncedSave, status: saveStatus } = useAutoSave(handleSaveAnswer);

  // --- Answer change handler ---
  const handleAnswerChange = useCallback(
    (questionId: string, value: string) => {
      setAnswers((prev) => {
        const next = new Map(prev);
        next.set(questionId, value);
        return next;
      });
      // Clear unanswered highlight when the user provides an answer
      setUnansweredRequired((prev) => {
        if (!prev.has(questionId)) return prev;
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
      debouncedSave(questionId, value);
    },
    [debouncedSave],
  );

  // --- Submit flow ---
  const handleSubmitClick = () => {
    setSubmitError(null);
    // Validate required questions
    const missing = questions
      .filter((q) => q.required)
      .filter((q) => {
        const val = answers.get(q.id);
        return !val || val.trim() === "" || val === "[]";
      })
      .map((q) => q.id);

    if (missing.length > 0) {
      setUnansweredRequired(new Set(missing));
      // Scroll to first unanswered required question
      const firstMissing = missing[0]!;
      const el = questionRefs.current.get(firstMissing);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    setShowConfirmDialog(true);
  };

  const handleConfirmSubmit = async () => {
    if (!responseId) return;
    setShowConfirmDialog(false);
    setSubmitError(null);

    const walletAddress = user?.wallet?.address;
    if (!walletAddress || !contentHash) {
      setSubmitError("Wallet not ready. Please try again.");
      return;
    }

    setIsSigning(true);
    try {
      // Build answer data for hashing
      const responseAnswers: ResponseAnswer[] = questions
        .filter((q) => answers.has(q.id))
        .map((q) => ({
          questionIndex: q.index,
          questionType: QUESTION_TYPE_INDEX[q.type] ?? 0,
          value: answers.get(q.id) ?? "",
        }))
        .sort((a, b) => a.questionIndex - b.questionIndex);

      const answersHash = hashAnswers(responseAnswers);
      const blindedId = computeBlindedId(
        walletAddress as `0x${string}`,
        contentHash as `0x${string}`,
      );

      // Find wallet and sign
      const embeddedWallet = wallets.find(
        (w) => w.address.toLowerCase() === walletAddress.toLowerCase(),
      );
      if (!embeddedWallet) {
        setSubmitError("Wallet not found. Please try again.");
        setIsSigning(false);
        return;
      }
      const provider = await embeddedWallet.getEthereumProvider();

      const signature = await signSurveyResponse(
        provider,
        walletAddress as `0x${string}`,
        {
          surveyHash: contentHash as `0x${string}`,
          blindedId,
          answerCount: responseAnswers.length,
          answersHash,
        },
      );

      setIsSigning(false);

      submitMutation.mutate(
        { responseId, signature },
        {
          onSuccess: () => {
            router.push(`/s/${slug}/confirmation`);
          },
          onError: (error) => {
            setSubmitError(error.message);
          },
        },
      );
    } catch (err: unknown) {
      setIsSigning(false);
      const message = err instanceof Error ? err.message : "Signing failed";
      if (message.includes("rejected") || message.includes("denied")) {
        setSubmitError("Signature rejected. Please try again.");
      } else {
        setSubmitError(message);
      }
    }
  };

  // --- Clear responses ---
  const handleClearResponses = () => {
    if (!responseId) return;
    if (!window.confirm("Clear all your responses? This cannot be undone.")) return;
    clearMutation.mutate(
      { responseId },
      {
        onSuccess: () => {
          setAnswers(new Map());
          setUnansweredRequired(new Set());
        },
      },
    );
  };

  // --- Progress ---
  const answeredCount = Array.from(answers.values()).filter(
    (v) => v && v.trim() !== "" && v !== "[]",
  ).length;
  const totalCount = questions.length;

  // --- Save status label ---
  const saveStatusLabel =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "saved"
        ? "All changes saved"
        : saveStatus === "error"
          ? "Save failed"
          : "";

  // --- Error states ---
  if (startError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold">{surveyTitle}</h1>
        <p className="mt-6 text-red-600">{startError}</p>
      </main>
    );
  }

  if (!responseId) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-gray-500">Loading survey...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {/* --- Survey-closed overlay --- */}
      {surveyClosed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 text-center shadow-lg">
            <h2 className="text-lg font-bold">This survey has closed</h2>
            <p className="mt-2 text-sm text-gray-600">
              The survey creator closed this survey while you were responding.
              Your in-progress answers were not submitted.
            </p>
            <a
              href={`/s/${slug}`}
              className="mt-4 inline-block rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Back to survey
            </a>
          </div>
        </div>
      )}

      {/* --- Header --- */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white pb-4 pt-2">
        <div>
          <h1 className="text-xl font-bold">{surveyTitle}</h1>
          {saveStatusLabel && (
            <p
              className={`mt-1 text-xs ${
                saveStatus === "error" ? "text-red-500" : "text-gray-400"
              }`}
            >
              {saveStatusLabel}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSubmitClick}
          disabled={submitMutation.isPending || isSigning || !user?.wallet?.address}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          title={!user?.wallet?.address ? "Wallet not ready" : undefined}
        >
          {isSigning ? "Signing..." : submitMutation.isPending ? "Submitting..." : "Submit"}
        </button>
      </header>

      {submitError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      {/* --- Questions --- */}
      <div className="mt-6 space-y-8">
        {questions.map((question, idx) => (
          <div
            key={question.id}
            ref={(el) => {
              questionRefs.current.set(question.id, el);
            }}
            className={`rounded-lg border p-5 ${
              unansweredRequired.has(question.id)
                ? "border-red-400 bg-red-50"
                : "border-gray-200"
            }`}
          >
            <p className="font-medium">
              <span className="mr-2 text-gray-400">{idx + 1}.</span>
              {question.text}
              {question.required && <span className="ml-1 text-red-500">*</span>}
            </p>

            {unansweredRequired.has(question.id) && (
              <p className="mt-1 text-xs text-red-500">This question is required</p>
            )}

            <div className="mt-3">
              {question.type === "SINGLE_SELECT" && question.options && (
                <SingleSelectInput
                  options={question.options}
                  value={answers.get(question.id) ?? ""}
                  onChange={(val) => handleAnswerChange(question.id, val)}
                  required={question.required}
                />
              )}
              {question.type === "MULTIPLE_CHOICE" && question.options && (
                <MultipleChoiceInput
                  options={question.options}
                  value={answers.get(question.id) ?? ""}
                  onChange={(val) => handleAnswerChange(question.id, val)}
                  required={question.required}
                />
              )}
              {question.type === "RATING" && (
                <RatingInput
                  minRating={question.minRating ?? 1}
                  maxRating={question.maxRating ?? 5}
                  value={answers.get(question.id) ?? ""}
                  onChange={(val) => handleAnswerChange(question.id, val)}
                  required={question.required}
                />
              )}
              {question.type === "FREE_TEXT" && (
                <FreeTextInput
                  maxLength={question.maxLength ?? 2000}
                  value={answers.get(question.id) ?? ""}
                  onChange={(val) => handleAnswerChange(question.id, val)}
                  required={question.required}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* --- Footer --- */}
      <footer className="mt-8 flex items-center justify-between border-t pt-4">
        <p className="text-sm text-gray-500">
          {answeredCount} of {totalCount} answered
        </p>
        <button
          type="button"
          onClick={handleClearResponses}
          disabled={clearMutation.isPending}
          className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
        >
          {clearMutation.isPending ? "Clearing..." : "Clear responses"}
        </button>
      </footer>

      {/* --- Signing / Submitting Overlay --- */}
      {(isSigning || submitMutation.isPending) && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <p className="mt-4 text-lg font-medium text-gray-700">
            {isSigning ? "Waiting for signature..." : "Submitting your response..."}
          </p>
          <p className="mt-1 text-sm text-gray-500">Please don&apos;t close this page.</p>
        </div>
      )}

      {/* --- Confirmation Dialog --- */}
      {showConfirmDialog && !submitMutation.isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-bold">Submit your response?</h2>
            <p className="mt-2 text-sm text-gray-600">
              This cannot be changed after submission.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmDialog(false)}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmSubmit()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Confirm &amp; Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
