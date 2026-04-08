"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "~/app/_components/auth-guard";
import { api } from "~/trpc/react";
import { LIMITS } from "~/app/surveys/[id]/edit/_lib/constants";

function NewSurveyForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const createMutation = api.survey.create.useMutation({
    onSuccess: (data) => {
      router.push(`/s/${data.slug}/edit?step=questions`);
    },
    onError: (err) => {
      setCreateError(err.message ?? "Failed to create survey. Please try again.");
    },
  });

  const handleNext = () => {
    setTitleError(null);
    setCreateError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError("Title is required");
      return;
    }
    if (trimmedTitle.length > LIMITS.TITLE_MAX) {
      setTitleError(`Title must be ${LIMITS.TITLE_MAX} characters or fewer`);
      return;
    }

    createMutation.mutate({ title: trimmedTitle, description: description.trim() });
  };

  const isPending = createMutation.isPending;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-xl">
          <p className="text-sm text-gray-500">Step 1 of 4</p>
          <h1 className="mt-0.5 text-xl font-semibold text-gray-900">
            Create a New Survey
          </h1>
        </div>
      </header>

      {/* Form */}
      <main className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6">
          <div className="space-y-6">
            {/* Title */}
            <div>
              <label
                htmlFor="survey-title"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Survey Title <span className="text-red-500">*</span>
              </label>
              <input
                id="survey-title"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (titleError) setTitleError(null);
                }}
                maxLength={LIMITS.TITLE_MAX}
                placeholder="e.g. Customer Satisfaction Survey"
                disabled={isPending}
                className={[
                  "w-full rounded-lg border px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100",
                  titleError
                    ? "border-red-400 focus:ring-red-400"
                    : "border-gray-300 focus:border-blue-500",
                ].join(" ")}
              />
              <div className="mt-1 flex items-center justify-between">
                {titleError ? (
                  <p className="text-xs text-red-600">{titleError}</p>
                ) : (
                  <span />
                )}
                <p className="text-xs text-gray-400">
                  {title.length}/{LIMITS.TITLE_MAX}
                </p>
              </div>
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="survey-description"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Description{" "}
                <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                id="survey-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={LIMITS.DESCRIPTION_MAX}
                placeholder="Describe what this survey is about and why respondents should participate."
                rows={4}
                disabled={isPending}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              />
              <p className="mt-1 text-right text-xs text-gray-400">
                {description.length}/{LIMITS.DESCRIPTION_MAX}
              </p>
            </div>

            {/* Create error */}
            {createError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {createError}
              </p>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-xl justify-end">
          <button
            type="button"
            onClick={handleNext}
            disabled={isPending}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Next"}
          </button>
        </div>
      </footer>
    </div>
  );
}

export default function NewSurveyPage() {
  return (
    <AuthGuard>
      <NewSurveyForm />
    </AuthGuard>
  );
}
