"use client";

import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "~/app/_components/auth-guard";
import { api } from "~/trpc/react";
import { SurveyBuilderClient } from "~/app/surveys/[id]/edit/_components/SurveyBuilderClient";

export default function SurveyBuilderBySlugPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();

  const { data: survey, isLoading, error } = api.survey.getForEdit.useQuery(
    { slug: params.slug },
    { retry: false },
  );

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-gray-500">Loading survey...</p>
        </div>
      </AuthGuard>
    );
  }

  if (error || !survey) {
    return (
      <AuthGuard>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <p className="text-gray-700 font-medium">Survey not found</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 text-sm text-blue-600 hover:underline"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </AuthGuard>
    );
  }

  if (survey.status !== "DRAFT") {
    router.push(`/s/${survey.slug}`);
    return null;
  }

  return (
    <AuthGuard>
      <SurveyBuilderClient initialSurvey={survey} />
    </AuthGuard>
  );
}
