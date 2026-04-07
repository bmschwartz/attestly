"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AuthGuard } from "~/app/_components/auth-guard";
import { api } from "~/trpc/react";

function VerificationProofSection({
  blindedId,
  ipfsCid,
  submitTxHash,
  verificationStatus,
}: {
  blindedId: string | null;
  ipfsCid: string | null;
  submitTxHash: string | null;
  verificationStatus: string;
}) {
  return (
    <details className="w-full rounded-lg border border-gray-200 bg-gray-50">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700">
        Verification Proof
      </summary>
      <div className="space-y-2 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
        {blindedId && (
          <div>
            <span className="font-medium text-gray-700">Blinded ID:</span>{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs break-all">
              {blindedId}
            </code>
          </div>
        )}
        <div>
          <span className="font-medium text-gray-700">Status:</span>{" "}
          {verificationStatus === "NONE" ? "Recorded" : verificationStatus}
        </div>
        {ipfsCid && (
          <div>
            <span className="font-medium text-gray-700">IPFS CID:</span>{" "}
            <a
              href={`https://gateway.pinata.cloud/ipfs/${ipfsCid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline break-all"
            >
              {ipfsCid}
            </a>
          </div>
        )}
        {submitTxHash && (
          <div>
            <span className="font-medium text-gray-700">Transaction:</span>{" "}
            <a
              href={`https://basescan.org/tx/${submitTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline break-all"
            >
              {submitTxHash}
            </a>
          </div>
        )}
      </div>
    </details>
  );
}

function ConfirmationContent({ slug }: { slug: string }) {
  const { data, isLoading, error } = api.response.getConfirmation.useQuery(
    { slug },
    { enabled: !!slug },
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading confirmation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">
            Confirmation not found
          </h1>
          <p className="mt-2 text-gray-500">
            {error.message === "No submitted response found for this survey"
              ? "You haven't submitted a response to this survey."
              : "This survey could not be found."}
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { survey, response, respondentEmail } = data;
  const isClosed = survey.status === "CLOSED";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-6 text-center">
        {/* Success icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>

        {/* Success message */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Response Submitted
          </h1>
          <p className="mt-1 text-gray-600">{survey.title}</p>
          {response.submittedAt && (
            <p className="mt-1 text-sm text-gray-400">
              Submitted{" "}
              {new Date(response.submittedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>

        {/* Verification proof */}
        <VerificationProofSection
          blindedId={response.blindedId}
          ipfsCid={response.ipfsCid}
          submitTxHash={response.submitTxHash}
          verificationStatus={response.verificationStatus}
        />

        {/* Results notice */}
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {isClosed ? (
            <p>
              Results are available.{" "}
              <a
                href={`/s/${slug}/results`}
                className="font-medium underline"
              >
                View results
              </a>
            </p>
          ) : (
            <p>
              Survey results will be available when this survey closes.
            </p>
          )}
        </div>

        {/* Email notice */}
        <div className="text-sm text-gray-500">
          {respondentEmail ? (
            <p>
              We&apos;ll send you an email at{" "}
              <span className="font-medium text-gray-700">
                {respondentEmail}
              </span>{" "}
              when results are ready.
            </p>
          ) : (
            <p>
              Add an email to be notified when results are ready.
            </p>
          )}
        </div>

        {/* Navigation links */}
        <div className="flex justify-center gap-4 pt-2">
          <Link
            href="/my-responses"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            My Responses
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ConfirmationPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  return (
    <AuthGuard>
      <ConfirmationContent slug={slug} />
    </AuthGuard>
  );
}
