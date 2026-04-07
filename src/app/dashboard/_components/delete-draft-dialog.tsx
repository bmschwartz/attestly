"use client";

import { api } from "~/trpc/react";

export function DeleteDraftDialog({
  surveyId,
  onClose,
}: {
  surveyId: string;
  onClose: () => void;
}) {
  const utils = api.useUtils();

  const deleteDraft = api.survey.deleteDraft.useMutation({
    onSuccess: () => {
      void utils.survey.listMine.invalidate();
      void utils.survey.getStats.invalidate();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">
          Delete this draft?
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          This cannot be undone. The survey and all its questions will be
          permanently deleted.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={() => deleteDraft.mutate({ id: surveyId })}
            disabled={deleteDraft.isPending}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleteDraft.isPending ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
