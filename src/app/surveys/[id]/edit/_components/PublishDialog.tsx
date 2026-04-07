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
    onSuccess: (data) => {
      // Redirect to the published survey landing page
      router.push(`/s/${data.slug}`);
    },
    onError: () => {
      // Stay on dialog, show error
    },
  });

  const handleConfirm = () => {
    publishMutation.mutate({ id: surveyId });
  };

  if (publishMutation.isPending) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        <p className="mt-4 text-lg font-medium text-gray-700">Publishing your survey...</p>
        <p className="mt-1 text-sm text-gray-500">Please don&apos;t close this page.</p>
      </div>
    );
  }

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
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Publish
          </button>
        </div>
      </div>
    </div>
  );
}
