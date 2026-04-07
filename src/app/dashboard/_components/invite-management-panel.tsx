"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

interface InviteManagementPanelProps {
  surveyId: string;
  onClose: () => void;
}

export function InviteManagementPanel({
  surveyId,
  onClose,
}: InviteManagementPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const utils = api.useUtils();

  const { data: invites, isLoading: invitesLoading } =
    api.invite.list.useQuery({ surveyId });

  const { data: progress } = api.invite.getProgress.useQuery({ surveyId });

  const addMutation = api.invite.add.useMutation({
    onSuccess: () => {
      setInputValue("");
      setError(null);
      void utils.invite.list.invalidate({ surveyId });
      void utils.invite.getProgress.invalidate({ surveyId });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const removeMutation = api.invite.remove.useMutation({
    onSuccess: () => {
      void utils.invite.list.invalidate({ surveyId });
      void utils.invite.getProgress.invalidate({ surveyId });
    },
  });

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setError(null);
    addMutation.mutate({ surveyId, value: trimmed });
  };

  const handleRemove = (inviteId: string, type: string) => {
    if (type === "DOMAIN") {
      const confirmed = window.confirm(
        "Remove this domain invite? This may affect many users.",
      );
      if (!confirmed) return;
    }
    removeMutation.mutate({ inviteId });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  // Detect input type for hint text
  const trimmedInput = inputValue.trim();
  const inputHint = trimmedInput
    ? trimmedInput.includes("@")
      ? "Email invite"
      : "Domain invite"
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Manage Invites
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Progress indicator */}
        {progress && progress.total > 0 && (
          <div className="border-b border-gray-200 bg-blue-50 px-6 py-3">
            <p className="text-sm text-blue-700">
              {progress.responded} of {progress.total} invited have responded
            </p>
          </div>
        )}

        {/* Add invite input */}
        <div className="px-6 py-4">
          <label
            htmlFor="invite-input"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Add emails or domain
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                id="invite-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="user@example.com or example.com (comma-separated)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={addMutation.isPending}
              />
              {inputHint && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  {inputHint}
                </span>
              )}
            </div>
            <button
              onClick={handleAdd}
              disabled={!trimmedInput || addMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addMutation.isPending ? "Adding..." : "Add"}
            </button>
          </div>
          {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        </div>

        {/* Invite list */}
        <div className="max-h-64 overflow-y-auto border-t border-gray-200 px-6 py-2">
          {invitesLoading ? (
            <div className="py-4 text-center text-sm text-gray-400">
              Loading invites...
            </div>
          ) : !invites || invites.length === 0 ? (
            <div className="py-4 text-center text-sm text-gray-400">
              No invites yet. Add email addresses or domains above.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-2">
                    {/* Type icon */}
                    {invite.type === "EMAIL" ? (
                      <svg
                        className="h-4 w-4 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        aria-label="Email invite"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-4 w-4 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        aria-label="Domain invite"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
                        />
                      </svg>
                    )}
                    <span className="text-sm text-gray-700">
                      {invite.value}
                    </span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                      {invite.type === "EMAIL" ? "Email" : "Domain"}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemove(invite.id, invite.type)}
                    disabled={removeMutation.isPending}
                    className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
                    aria-label={`Remove ${invite.value}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-gray-200 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
