import Image from "next/image";
import { api } from "~/trpc/server";
import { notFound } from "next/navigation";
import { SurveyCard } from "~/app/_components/survey-card";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  let profile;
  try {
    profile = await api.user.getProfile({ userId });
  } catch {
    notFound();
  }

  if (!profile) {
    notFound();
  }

  const surveys = await api.user.getPublicSurveys({ userId });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {/* Profile Header */}
      <div className="flex items-start gap-4">
        <div className="h-16 w-16 flex-shrink-0 rounded-full bg-gray-200 overflow-hidden">
          {profile.avatar ? (
            <Image src={profile.avatar} alt="" width={64} height={64} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-gray-400">
              {(profile.displayName ?? "?")[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold">
            {profile.displayName ?? profile.walletAddress.slice(0, 10) + "..."}
          </h1>
          <p className="text-sm text-gray-500">{profile.walletAddress}</p>
          {profile.bio && <p className="mt-1 text-sm text-gray-600">{profile.bio}</p>}
          <p className="mt-2 text-xs text-gray-400">
            Joined {new Date(profile.createdAt).toLocaleDateString()} ·{" "}
            {profile.surveyCount} surveys · {profile.responseCount} total responses
          </p>
        </div>
      </div>

      {/* Surveys */}
      <section className="mt-8">
        <h2 className="font-medium text-gray-600">Surveys</h2>
        <div className="mt-3 space-y-3">
          {surveys.items.map((s) => (
            <SurveyCard key={s.id} survey={s} />
          ))}
          {surveys.items.length === 0 && (
            <p className="text-gray-400">No public surveys yet</p>
          )}
        </div>
      </section>
    </main>
  );
}
