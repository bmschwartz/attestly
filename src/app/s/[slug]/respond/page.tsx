import { api } from "~/trpc/server";
import { notFound, redirect } from "next/navigation";
import { SurveyRespondForm } from "./survey-respond-form";

export default async function SurveyRespondPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let survey;
  try {
    survey = await api.survey.getBySlug({ slug });
  } catch {
    notFound();
  }

  if (!survey || survey.status === "DRAFT") {
    notFound();
  }

  if (survey.status === "CLOSED" || survey.status === "PUBLISHING" || survey.status === "CLOSING") {
    redirect(`/s/${slug}`);
  }

  return (
    <SurveyRespondForm
      surveyId={survey.id}
      surveyTitle={survey.title}
      slug={slug}
      contentHash={survey.contentHash}
      questions={survey.questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.questionType as "SINGLE_SELECT" | "MULTIPLE_CHOICE" | "RATING" | "FREE_TEXT",
        required: q.required,
        index: q.position,
        options: q.options as string[] | null,
        minRating: q.minRating,
        maxRating: q.maxRating,
        maxLength: q.maxLength,
      }))}
    />
  );
}
