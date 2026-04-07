import { api } from "~/trpc/server";
import { notFound } from "next/navigation";
import Link from "next/link";

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

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold">{survey.title}</h1>
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
      ) : (
        <Link
          href={`/s/${slug}/respond`}
          className="mt-8 inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
        >
          Start Survey
        </Link>
      )}

      {survey.publishedAt && (
        <p className="mt-6 text-xs text-gray-400">
          Published {new Date(survey.publishedAt).toLocaleDateString()}
        </p>
      )}
    </main>
  );
}
