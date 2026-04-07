"use client";

import { api } from "~/trpc/react";
import { useState } from "react";

interface AiSummaryCardProps {
  surveyId: string;
  questionId: string | null;
  content: string | null; // null = still generating
}

export function AiSummaryCard({ surveyId, questionId, content }: AiSummaryCardProps) {
  const [focusPrompt, setFocusPrompt] = useState("");
  const [showFocusInput, setShowFocusInput] = useState(false);
  const regenerate = api.ai.regenerateSummary.useMutation();

  if (!content) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm text-blue-700">Generating AI summary...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">AI Summary</span>
        <button
          onClick={() => setShowFocusInput(!showFocusInput)}
          className="text-xs text-blue-600 hover:underline"
        >
          Regenerate
        </button>
      </div>
      <div className="prose prose-sm" dangerouslySetInnerHTML={{ __html: content }} />
      {showFocusInput && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={focusPrompt}
            onChange={(e) => setFocusPrompt(e.target.value)}
            placeholder="Focus on... (optional)"
            className="flex-1 rounded border px-2 py-1 text-sm"
          />
          <button
            onClick={() => {
              regenerate.mutate({ surveyId, questionId, focusPrompt: focusPrompt || undefined });
              setShowFocusInput(false);
              setFocusPrompt("");
            }}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white"
          >
            Go
          </button>
        </div>
      )}
    </div>
  );
}
