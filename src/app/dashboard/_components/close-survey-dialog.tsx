"use client";

import { api } from "~/trpc/react";

export function CloseSurveyDialog({
  surveyId,
  onClose,
}: {
  surveyId: string;
  onClose: () => void;
}) {
  const utils = api.useUtils();

  const closeSurvey = api.survey.close.useMutation({
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
          Close this survey?
        </h3>
        <div className="mt-2 space-y-2 text-sm text-gray-600">
          <p>Closing a survey will:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Stop accepting new responses immediately</li>
            <li>Discard any in-progress (incomplete) responses</li>
            <li>
              Notify all respondents who submitted a response via email
            </li>
          </ul>
          <p className="font-medium text-gray-700">
            This action cannot be undone.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={() => closeSurvey.mutate({ id: surveyId })}
            disabled={closeSurvey.isPending}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {closeSurvey.isPending ? "Closing..." : "Close Survey"}
          </button>
        </div>
      </div>
    </div>
  );
}
