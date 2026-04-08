import { api } from "~/trpc/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { FREE_TIER_LIMITS } from "~/lib/premium";
import type { SubscriptionPlan, SubscriptionStatus } from "../../../../generated/prisma";
import { StartSurveyButton } from "./_components/start-survey-button";
import { VerificationBadge } from "~/app/_components/verification-badge";

export default async function SurveyLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let survey;
  try {
    survey = await api.survey.getBySlug({ slug });
  } catch {
    notFound();
  }

  if (!survey) {
    notFound();
  }

  const questionCount = survey.questions?.length ?? 0;
  const estimatedMinutes = Math.max(1, Math.ceil((questionCount * 30) / 60));
  const responseCount = survey._count?.responses ?? 0;

  // Check if free-tier response limit is reached
  const creatorSub = (survey.creator as { subscription?: { plan: SubscriptionPlan; status: SubscriptionStatus } | null }).subscription;
  const creatorPremium = creatorSub != null && creatorSub.plan !== "FREE" && creatorSub.status === "ACTIVE";
  const isResponseLimitReached =
    !creatorPremium && responseCount >= FREE_TIER_LIMITS.maxResponsesPerSurvey;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">{survey.title}</h1>
        <VerificationBadge status={survey.verificationStatus} size="md" />
      </div>
      {survey.verificationStatus !== "NONE" && (
        <Link
          href={`/s/${slug}/verify`}
          className="mt-1 inline-block text-sm text-blue-600 hover:underline"
        >
          Verify attestation
        </Link>
      )}
      <p className="mt-2 text-sm text-gray-500">
        by{" "}
        {survey.creator.displayName ??
          survey.creator.walletAddress.slice(0, 10) + "..."}
      </p>

      <p className="mt-6 text-gray-700">{survey.description}</p>

      <p className="mt-4 text-sm text-gray-500">
        {questionCount} questions · ~{estimatedMinutes} min
      </p>

      {survey.status === "CLOSED" ? (
        <div className="mt-8 rounded-lg border border-gray-300 bg-gray-50 p-4 text-center">
          <p className="font-medium">This survey is closed</p>
          <Link
            href={`/s/${slug}/results`}
            className="mt-2 inline-block text-blue-600 hover:underline"
          >
            View results
          </Link>
        </div>
      ) : isResponseLimitReached ? (
        <div className="mt-8 rounded-lg border border-gray-300 bg-gray-50 p-4 text-center">
          <p className="font-medium text-gray-700">This survey has reached its response limit</p>
          <p className="mt-1 text-sm text-gray-500">No new responses are being accepted.</p>
        </div>
      ) : (
        <StartSurveyButton slug={slug} />
      )}

      {survey.publishedAt && (
        <p className="mt-6 text-xs text-gray-400">
          Published {new Date(survey.publishedAt).toLocaleDateString()}
        </p>
      )}
    </main>
  );
}
