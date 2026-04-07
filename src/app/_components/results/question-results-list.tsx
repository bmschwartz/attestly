"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { BarChart } from "./bar-chart";
import { RatingResult } from "./rating-result";
import { FreeTextList } from "./free-text-list";
import { AiSummaryCard } from "~/app/_components/ai-summary-card";
import { PremiumUpsell } from "~/app/_components/premium-upsell";

type SelectAggregation = {
  questionId: string;
  questionText: string;
  questionType: "SINGLE_SELECT" | "MULTIPLE_CHOICE";
  position: number;
  options: string[];
  totalResponses: number;
  optionCounts: { value: string; count: number; percentage: number }[];
};

type RatingAggregation = {
  questionId: string;
  questionText: string;
  questionType: "RATING";
  position: number;
  minRating: number;
  maxRating: number;
  totalResponses: number;
  average: number;
  distribution: { value: number; count: number; percentage: number }[];
};

type FreeTextAggregation = {
  questionId: string;
  questionText: string;
  questionType: "FREE_TEXT";
  position: number;
  totalResponses: number;
  responses: { value: string; submittedAt: Date }[];
  page: number;
  totalPages: number;
};

type QuestionAggregation = SelectAggregation | RatingAggregation | FreeTextAggregation;

function FreeTextQuestionSection({
  question,
  slug,
}: {
  question: FreeTextAggregation;
  slug: string;
}) {
  const [page, setPage] = useState(question.page);

  const { data } = api.results.getQuestionAggregation.useQuery(
    { slug, questionId: question.questionId, page },
    { enabled: page !== question.page },
  );

  const currentData = (
    page === question.page ? question : data
  ) as FreeTextAggregation | undefined;

  return (
    <FreeTextList
      responses={currentData?.responses ?? question.responses}
      totalResponses={currentData?.totalResponses ?? question.totalResponses}
      page={currentData?.page ?? page}
      totalPages={currentData?.totalPages ?? question.totalPages}
      onPageChange={setPage}
    />
  );
}

type AiSummaryItem = { questionId: string | null; content: string };

function QuestionSection({
  question,
  index,
  slug,
  isPremium,
  surveyId,
  aiSummaries,
}: {
  question: QuestionAggregation;
  index: number;
  slug: string;
  isPremium: boolean;
  surveyId: string;
  aiSummaries: AiSummaryItem[];
}) {
  const questionSummary =
    question.questionType === "FREE_TEXT"
      ? (aiSummaries.find((s) => s.questionId === question.questionId) ?? null)
      : null;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="text-base font-semibold text-gray-900">
        {index + 1}. {question.questionText}
      </h3>
      <div className="mt-3">
        {(question.questionType === "SINGLE_SELECT" ||
          question.questionType === "MULTIPLE_CHOICE") && (
          <BarChart
            options={question.optionCounts}
            totalResponses={question.totalResponses}
            questionType={question.questionType}
          />
        )}
        {question.questionType === "RATING" && (
          <RatingResult
            average={question.average}
            distribution={question.distribution}
            totalResponses={question.totalResponses}
            minRating={question.minRating}
            maxRating={question.maxRating}
          />
        )}
        {question.questionType === "FREE_TEXT" && (
          <>
            <FreeTextQuestionSection question={question} slug={slug} />
            <div className="mt-3">
              {isPremium ? (
                <AiSummaryCard
                  surveyId={surveyId}
                  questionId={question.questionId}
                  content={questionSummary?.content ?? null}
                />
              ) : (
                <PremiumUpsell
                  feature="AI Summary"
                  message={`Get AI-powered analysis of these ${question.totalResponses} free text responses — available on Premium`}
                />
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function QuestionResultsList({
  questions,
  slug,
  isPremium = false,
  surveyId = "",
  aiSummaries = [],
}: {
  questions: QuestionAggregation[];
  slug: string;
  isPremium?: boolean;
  surveyId?: string;
  aiSummaries?: AiSummaryItem[];
}) {
  if (questions.length === 0) {
    return (
      <p className="text-center text-sm text-gray-500">
        No questions found for this survey.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {questions.map((question, index) => (
        <QuestionSection
          key={question.questionId}
          question={question}
          index={index}
          slug={slug}
          isPremium={isPremium}
          surveyId={surveyId}
          aiSummaries={aiSummaries}
        />
      ))}
    </div>
  );
}
