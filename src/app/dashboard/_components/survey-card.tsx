"use client";

import { useState } from "react";
import { type RouterOutputs } from "~/trpc/react";
import { DeleteDraftDialog } from "./delete-draft-dialog";
import { CloseSurveyDialog } from "./close-survey-dialog";
import { VerificationBadge } from "~/app/_components/verification-badge";

type Survey = RouterOutputs["survey"]["listMine"]["surveys"][number];

function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    PUBLISHING: "bg-yellow-100 text-yellow-700",
    PUBLISHED: "bg-green-100 text-green-700",
    CLOSING: "bg-orange-100 text-orange-700",
    CLOSED: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function DraftCard({ survey }: { survey: Survey }) {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-gray-900">{survey.title}</h3>
              <StatusBadge status="DRAFT" />
            </div>
            <div className="mt-2 flex gap-4 text-sm text-gray-500">
              <span>{survey._count.questions} questions</span>
              <span>Created {formatDate(survey.createdAt)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href={`/s/${survey.slug}/edit`}
              className="rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-100"
            >
              Edit
            </a>
            <button
              onClick={() => setShowDelete(true)}
              className="rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
      {showDelete && (
        <DeleteDraftDialog
          surveyId={survey.id}
          onClose={() => setShowDelete(false)}
        />
      )}
    </>
  );
}

function PublishedCard({ survey }: { survey: Survey }) {
  const [showClose, setShowClose] = useState(false);
  const [copied, setCopied] = useState(false);

  const surveyUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/s/${survey.slug}`;

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(surveyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-gray-900">{survey.title}</h3>
              <StatusBadge status="PUBLISHED" />
              <VerificationBadge status={survey.verificationStatus} size="sm" />
              {survey.isPrivate && (
                <span className="text-gray-400" title="Private survey">
                  🔒
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
              <span>{survey._count.responses} responses</span>
              <span>Published {formatDate(survey.publishedAt)}</span>
              <span className="font-mono text-xs text-gray-400">
                /s/{survey.slug}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/s/${survey.slug}/results`}
              className="rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-100"
            >
              View Results
            </a>
            <button
              onClick={handleCopyLink}
              className="rounded-md bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <button
              onClick={() => setShowClose(true)}
              className="rounded-md bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100"
            >
              Close Survey
            </button>
          </div>
        </div>
      </div>
      {showClose && (
        <CloseSurveyDialog
          surveyId={survey.id}
          contentHash={survey.contentHash}
          onClose={() => setShowClose(false)}
        />
      )}
    </>
  );
}

function ClosedCard({ survey }: { survey: Survey }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900">{survey.title}</h3>
            <StatusBadge status="CLOSED" />
              <VerificationBadge status={survey.verificationStatus} size="sm" />
          </div>
          <div className="mt-2 flex gap-4 text-sm text-gray-500">
            <span>{survey._count.responses} responses</span>
            <span>Closed {formatDate(survey.closedAt)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={`/s/${survey.slug}/results`}
            className="rounded-md bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-100"
          >
            View Results
          </a>
        </div>
      </div>
    </div>
  );
}

function TransitionalCard({
  survey,
  message,
}: {
  survey: Survey;
  message: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900">{survey.title}</h3>
            <StatusBadge status={survey.status} />
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
            <svg
              className="h-4 w-4 animate-spin text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>{message}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SurveyCard({ survey }: { survey: Survey }) {
  switch (survey.status) {
    case "DRAFT":
      return <DraftCard survey={survey} />;
    case "PUBLISHING":
      return (
        <TransitionalCard
          survey={survey}
          message="Publishing to blockchain..."
        />
      );
    case "PUBLISHED":
      return <PublishedCard survey={survey} />;
    case "CLOSING":
      return (
        <TransitionalCard
          survey={survey}
          message="Closing on blockchain..."
        />
      );
    case "CLOSED":
      return <ClosedCard survey={survey} />;
    default:
      return null;
  }
}
