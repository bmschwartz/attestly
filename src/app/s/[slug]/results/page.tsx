"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "~/trpc/react";
import { ResultsAccessGate } from "~/app/_components/results/results-access-gate";
import { QuestionResultsList } from "~/app/_components/results/question-results-list";

function ResultsHeader({
  title,
  responseCount,
  closedAt,
}: {
  title: string;
  responseCount: number;
  closedAt: Date | null;
}) {
  return (
    <div className="border-b border-gray-200 pb-6">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
        <span>
          {responseCount} response{responseCount !== 1 ? "s" : ""}
        </span>
        {closedAt && (
          <span>
            Closed{" "}
            {new Date(closedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data, isLoading, error } = api.results.getBySurvey.useQuery(
    { slug },
    { enabled: !!slug },
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <ResultsAccessGate
        surveyStatus={data?.survey.status ?? ""}
        resultsVisibility={data?.survey.resultsVisibility ?? ""}
        isLoading={isLoading}
        error={error}
      >
        {data && (
          <>
            <ResultsHeader
              title={data.survey.title}
              responseCount={data.responseCount}
              closedAt={data.survey.closedAt}
            />

            {data.responseCount === 0 ? (
              <div className="mt-12 text-center">
                <p className="text-gray-500">No responses were collected.</p>
              </div>
            ) : (
              <div className="mt-8">
                <QuestionResultsList
                  questions={data.questions}
                  slug={slug}
                />
              </div>
            )}

            {/* Navigation links */}
            <div className="mt-8 flex justify-center gap-4 border-t border-gray-200 pt-6">
              <Link
                href={`/s/${slug}`}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Survey Details
              </Link>
              <Link
                href="/my-responses"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                My Responses
              </Link>
              <Link
                href="/"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Home
              </Link>
            </div>
          </>
        )}
      </ResultsAccessGate>
    </main>
  );
}
