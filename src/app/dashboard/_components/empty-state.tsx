"use client";

import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

export function EmptyState() {
  const router = useRouter();
  const utils = api.useUtils();

  const createSurvey = api.survey.create.useMutation({
    onSuccess: (data) => {
      void utils.survey.getStats.invalidate();
      void utils.survey.listMine.invalidate();
      router.push(`/surveys/${data.id}/edit`);
    },
  });

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-16">
      <p className="text-lg text-gray-500">
        You haven&apos;t created any surveys yet.
      </p>
      <button
        onClick={() => createSurvey.mutate({})}
        disabled={createSurvey.isPending}
        className="mt-4 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {createSurvey.isPending
          ? "Creating..."
          : "Create Your First Survey"}
      </button>
    </div>
  );
}
