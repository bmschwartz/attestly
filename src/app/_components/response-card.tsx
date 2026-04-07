import type { RouterOutputs } from "~/trpc/react";

type MyResponse = RouterOutputs["response"]["listMine"][number];

function getStatusInfo(response: MyResponse): {
  label: string;
  color: string;
  href: string;
  linkText: string;
} {
  if (response.status === "IN_PROGRESS") {
    return {
      label: "In Progress",
      color: "bg-yellow-100 text-yellow-800",
      href: `/s/${response.survey.slug}/respond`,
      linkText: "Resume",
    };
  }

  if (response.survey.status === "CLOSED") {
    return {
      label: "Results Available",
      color: "bg-green-100 text-green-800",
      href: `/s/${response.survey.slug}/results`,
      linkText: "View Results",
    };
  }

  return {
    label: "Submitted, awaiting results",
    color: "bg-blue-100 text-blue-800",
    href: `/s/${response.survey.slug}/confirmation`,
    linkText: "View Confirmation",
  };
}

export function ResponseCard({ response }: { response: MyResponse }) {
  const statusInfo = getStatusInfo(response);

  const displayDate = response.submittedAt ?? response.createdAt;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <a
            href={`/s/${response.survey.slug}`}
            className="text-base font-semibold text-gray-900 hover:text-blue-600"
          >
            {response.survey.title}
          </a>
          <p className="mt-1 text-sm text-gray-500">
            {response.status === "IN_PROGRESS" ? "Started" : "Submitted"}{" "}
            {new Date(displayDate).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>

        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.color}`}
        >
          {statusInfo.label}
        </span>
      </div>

      {response.blindedId && (
        <p className="mt-2 text-xs text-gray-400">
          ID:{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5">
            {response.blindedId.slice(0, 12)}...
          </code>
        </p>
      )}

      <div className="mt-3 border-t border-gray-100 pt-3">
        <a
          href={statusInfo.href}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          {statusInfo.linkText} &rarr;
        </a>
      </div>
    </div>
  );
}
