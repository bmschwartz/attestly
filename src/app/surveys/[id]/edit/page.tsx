"use client";

import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "~/app/_components/auth-guard";
import { api } from "~/trpc/react";

/**
 * Legacy route: /surveys/[id]/edit
 * Redirects to the canonical slug-based wizard at /s/[slug]/edit.
 */
export default function SurveyBuilderRedirectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { data: survey, isLoading } = api.survey.getForEdit.useQuery(
    { id: params.id },
    { retry: false },
  );

  if (!isLoading && survey) {
    router.replace(`/s/${survey.slug}/edit`);
    return null;
  }

  return (
    <AuthGuard>
      <div className="flex min-h-screen items-center justify-center">
        {isLoading ? (
          <p className="text-gray-500">Redirecting…</p>
        ) : (
          <div className="text-center">
            <p className="font-medium text-gray-700">Survey not found</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 text-sm text-blue-600 hover:underline"
            >
              Back to dashboard
            </button>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
