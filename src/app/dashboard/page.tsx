import { redirect } from "next/navigation";
import { api, HydrateClient } from "~/trpc/server";
import { SurveyList } from "./_components/survey-list";

export const metadata = {
  title: "Dashboard | Attestly",
};

export default async function DashboardPage() {
  // Prefetch data for the dashboard on the server.
  // If this throws UNAUTHORIZED, the user is not logged in.
  try {
    await api.survey.getStats.prefetch();
    await api.survey.listMine.prefetch({});
  } catch {
    redirect("/");
  }

  return (
    <HydrateClient>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>
        <SurveyList />
      </main>
    </HydrateClient>
  );
}
