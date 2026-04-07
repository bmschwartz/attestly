"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

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
    </main>
  );
}
