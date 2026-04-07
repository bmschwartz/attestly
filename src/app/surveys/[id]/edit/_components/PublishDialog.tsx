"use client";

import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

interface PublishDialogProps {
  onClose: () => void;
  surveyId: string;
}

export function PublishDialog({ onClose, surveyId }: PublishDialogProps) {
  const router = useRouter();

  const publishMutation = api.survey.publish.useMutation({
    onSuccess: () => {
      // Redirect to the published survey landing page
      router.push(`/surveys/${surveyId}`);
    },
    onError: () => {
      // Stay on dialog, show error
    },
  });

  const handleConfirm = () => {
    publishMutation.mutate({ id: surveyId });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">
          Publish Survey
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Publishing makes this survey permanent and immutable. You will not be
          able to edit it after publishing. Continue?
        </p>

        {publishMutation.isError && (
          <p className="mt-3 text-sm text-red-600">
            {publishMutation.error?.message ?? "Failed to publish. Please try again."}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={publishMutation.isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={publishMutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {publishMutation.isPending ? "Publishing..." : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
