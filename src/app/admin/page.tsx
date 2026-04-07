"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import type { SubscriptionPlan } from "../../../generated/prisma";

const PLAN_OPTIONS: SubscriptionPlan[] = ["FREE", "PREMIUM", "ENTERPRISE"];

function SubscriptionManagementSection() {
  const [userId, setUserId] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>("FREE");
  const [result, setResult] = useState<string | null>(null);

  const setUserPlan = api.admin.setUserPlan.useMutation({
    onSuccess: (data) => {
      setResult(`Updated user ${data.userId} to ${data.plan}`);
    },
    onError: (err) => {
      setResult(`Error: ${err.message}`);
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId.trim()) return;
    setResult(null);
    await setUserPlan.mutateAsync({ userId: userId.trim(), plan: selectedPlan });
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-medium">Subscription Management</h2>
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">User ID (UUID)</label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="mt-1 w-full rounded border px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Plan</label>
          <select
            value={selectedPlan}
            onChange={(e) => setSelectedPlan(e.target.value as SubscriptionPlan)}
            className="mt-1 rounded border px-3 py-2 text-sm"
          >
            {PLAN_OPTIONS.map((plan) => (
              <option key={plan} value={plan}>{plan}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={setUserPlan.isPending || !userId.trim()}
          className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {setUserPlan.isPending ? "Updating..." : "Set Plan"}
        </button>
        {result && (
          <p className={`text-sm ${result.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
            {result}
          </p>
        )}
      </form>
    </section>
  );
}

export default function AdminPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const featured = api.explore.featured.useQuery();
  const searchResults = api.admin.searchSurveys.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 0 },
  );
  const featureSurvey = api.admin.featureSurvey.useMutation();
  const unfeatureSurvey = api.admin.unfeatureSurvey.useMutation();
  const utils = api.useUtils();

  async function handleFeature(surveyId: string) {
    await featureSurvey.mutateAsync({ surveyId });
    await utils.explore.featured.invalidate();
    setSearchQuery("");
  }

  async function handleUnfeature(surveyId: string) {
    await unfeatureSurvey.mutateAsync({ surveyId });
    await utils.explore.featured.invalidate();
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Admin</h1>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Featured Surveys</h2>

        {/* Current featured */}
        <div className="mt-4 space-y-2">
          {featured.data?.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded border p-3">
              <span className="text-sm">{s.title}</span>
              <button
                onClick={() => handleUnfeature(s.id)}
                className="text-xs text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
          {featured.data?.length === 0 && (
            <p className="text-sm text-gray-400">No featured surveys</p>
          )}
        </div>

        {/* Add featured */}
        {(featured.data?.length ?? 0) < 6 && (
          <div className="mt-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search surveys to feature..."
              className="w-full rounded border px-3 py-2 text-sm"
            />
            {searchResults.data && searchResults.data.length > 0 && (
              <div className="mt-2 rounded border">
                {searchResults.data.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleFeature(s.id)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <SubscriptionManagementSection />
    </main>
  );
}
