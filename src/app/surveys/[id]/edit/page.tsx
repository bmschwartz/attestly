import { notFound, redirect } from "next/navigation";
import { api } from "~/trpc/server";
import { SurveyBuilderClient } from "./_components/SurveyBuilderClient";

// Auth handled by AuthGuard component from Plan 1c

export default async function SurveyBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const survey = await api.survey.getForEdit({ id });
  if (!survey) {
    notFound();
  }

  // Cannot edit published/closed surveys
  if (survey.status !== "DRAFT") {
    redirect(`/surveys/${id}`);
  }

  return <SurveyBuilderClient initialSurvey={survey} />;
}
