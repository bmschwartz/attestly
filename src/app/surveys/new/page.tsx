"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "~/app/_components/auth-guard";
import { api } from "~/trpc/react";

/**
 * /surveys/new — Creates a new draft survey and redirects to the editor.
 *
 * The survey is created in the database on mount, then the user is
 * redirected to /s/[slug]/edit. This gives a clean URL immediately.
 */
export default function NewSurveyPage() {
  const router = useRouter();
  const createMutation = api.survey.create.useMutation();
  const hasCreated = useRef(false);

  useEffect(() => {
    if (hasCreated.current) return;
    hasCreated.current = true;

    createMutation.mutate(
      { title: "Untitled Survey" },
      {
        onSuccess: (data) => {
          router.replace(`/s/${data.slug}/edit`);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthGuard>
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          <p className="mt-4 text-gray-500">Creating your survey...</p>
        </div>
      </div>
    </AuthGuard>
  );
}
