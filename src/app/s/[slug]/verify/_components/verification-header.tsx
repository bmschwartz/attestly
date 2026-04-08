import Link from "next/link";
import { CopyButton } from "./copy-button";

export function VerificationHeader({
  title,
  slug,
  surveyHash,
}: {
  title: string;
  slug: string;
  surveyHash: string | null;
}) {
  return (
    <div className="border-b border-gray-200 pb-6">
      <Link
        href={`/s/${slug}`}
        className="text-sm text-blue-600 hover:underline"
      >
        &larr; Back to survey
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-gray-900">
        Verify: {title}
      </h1>

      {surveyHash && (
        <div className="mt-3 flex items-center gap-1">
          <span className="text-sm text-gray-500">Survey hash:</span>
          <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 break-all">
            {surveyHash}
          </code>
          <CopyButton text={surveyHash} />
        </div>
      )}
    </div>
  );
}
