import { api } from "~/trpc/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { VerificationHeader } from "./_components/verification-header";
import { OnChainDetails } from "./_components/on-chain-details";
import { VerificationBadge } from "~/app/_components/verification-badge";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  let title = "Verify | Attestly";
  try {
    const survey = await api.survey.getBySlug({ slug });
    if (survey) {
      title = `Verify: ${survey.title} | Attestly`;
    }
  } catch {
    // fall through with default title
  }
  return {
    title,
    description: "Verify on-chain attestation data for this survey.",
  };
}

export default async function SurveyVerifyPage({ params }: Props) {
  const { slug } = await params;

  // Fetch survey details for title
  let survey;
  try {
    survey = await api.survey.getBySlug({ slug });
  } catch {
    notFound();
  }
  if (!survey) notFound();

  // Fetch verification data
  let verificationStatus;
  try {
    verificationStatus = await api.verification.getStatus({ slug });
  } catch {
    notFound();
  }
  if (!verificationStatus) notFound();

  // Not yet published on-chain
  if (verificationStatus.status === "not_published") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <VerificationHeader
          title={survey.title}
          slug={slug}
          surveyHash={verificationStatus.surveyHash}
        />

        <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
          <VerificationBadge
            status={verificationStatus.verificationStatus}
            size="md"
          />
          <p className="mt-3 text-gray-600">
            This survey has not been published on-chain yet.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Verification data will appear here once the survey is published.
          </p>
        </div>

        <NoteSection />
      </main>
    );
  }

  // Published — fetch full proof data
  let surveyProof;
  try {
    surveyProof = await api.verification.getSurveyProof({ slug });
  } catch {
    // Degraded state
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <VerificationHeader
          title={survey.title}
          slug={slug}
          surveyHash={verificationStatus.surveyHash}
        />
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-amber-700">
            Some verification checks are temporarily unavailable. Please try
            again later.
          </p>
        </div>
        <NoteSection />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <VerificationHeader
        title={survey.title}
        slug={slug}
        surveyHash={verificationStatus.surveyHash}
      />

      <div className="mt-6">
        <VerificationBadge
          status={verificationStatus.verificationStatus}
          size="md"
        />
      </div>

      <div className="mt-8">
        <OnChainDetails
          proofData={surveyProof.proofData}
          responseCountSummary={surveyProof.responseCountSummary}
          integrityResult={surveyProof.integrityResult}
        />
      </div>

      <NoteSection />
    </main>
  );
}

function NoteSection() {
  return (
    <div className="mt-10 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm text-gray-500">
        <span className="font-medium text-gray-600">Note:</span> Full
        independent verification tools (CLI, static verification page) will
        be available before launch.
      </p>
    </div>
  );
}
