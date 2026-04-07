"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "~/trpc/react";
import { ResultsAccessGate } from "~/app/_components/results/results-access-gate";
import { QuestionResultsList } from "~/app/_components/results/question-results-list";
import { AiSummaryCard } from "~/app/_components/ai-summary-card";
import { PremiumUpsell } from "~/app/_components/premium-upsell";
import { ChatSidebar } from "~/app/_components/chat-sidebar";
import { usePremium } from "~/hooks/use-premium";

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
  const { isPremium } = usePremium();

  const { data, isLoading, error } = api.results.getBySurvey.useQuery(
    { slug },
    { enabled: !!slug },
  );

  // Fetch AI summaries — only runs if user is premium (server also enforces this)
  const { data: summaries } = api.ai.getSummaries.useQuery(
    { surveyId: data?.survey.id ?? "" },
    { enabled: isPremium && !!data?.survey.id },
  );

  const freeTextCount = data?.questions.filter(
    (q) => q.questionType === "FREE_TEXT",
  ).length ?? 0;
  const topLevelSummary = summaries?.find((s) => s.questionId === null) ?? null;

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

            {/* AI Insights section */}
            {data.responseCount > 0 && (
              <div className="mt-6">
                {isPremium ? (
                  <AiSummaryCard
                    surveyId={data.survey.id}
                    questionId={null}
                    content={topLevelSummary?.content ?? null}
                  />
                ) : (
                  <PremiumUpsell
                    feature="AI Insights"
                    message={`AI found insights from your ${data.responseCount} responses. Upgrade to Premium to read them.`}
                  />
                )}
              </div>
            )}

            {data.responseCount === 0 ? (
              <div className="mt-12 text-center">
                <p className="text-gray-500">No responses were collected.</p>
              </div>
            ) : (
              <div className="mt-8">
                <QuestionResultsList
                  questions={data.questions}
                  slug={slug}
                  isPremium={isPremium}
                  surveyId={data.survey.id}
                  aiSummaries={summaries ?? []}
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

      {/* Chat sidebar — premium only */}
      {data?.survey.id && (
        <ChatSidebar surveyId={data.survey.id} isPremium={isPremium} />
      )}
    </main>
  );
}
