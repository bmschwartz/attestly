"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { SurveyCard } from "~/app/_components/survey-card";

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sort, setSort] = useState<"trending" | "newest" | "most_responses">("trending");

  const isSearching = searchQuery.length > 0;
  const categories = api.explore.categories.useQuery();
  const featured = api.explore.featured.useQuery(undefined, { enabled: !isSearching });
  const trending = api.explore.trending.useQuery(undefined, { enabled: !isSearching });
  const searchResults = api.explore.search.useQuery(
    { query: searchQuery },
    { enabled: isSearching },
  );
  const browse = api.explore.browse.useQuery(
    { categories: selectedCategories.length > 0 ? selectedCategories : undefined, sort },
    { enabled: !isSearching },
  );

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">Explore Surveys</h1>

      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search surveys..."
        className="mt-4 w-full rounded-lg border px-4 py-3 text-lg"
      />

      {isSearching ? (
        <div className="mt-6 space-y-3">
          <h2 className="font-medium text-gray-600">Search results</h2>
          {searchResults.data?.map((s) => <SurveyCard key={s.id} survey={s} />)}
          {searchResults.data?.length === 0 && (
            <p className="text-gray-400">No surveys found</p>
          )}
        </div>
      ) : (
        <>
          {/* Featured */}
          {(featured.data?.length ?? 0) > 0 && (
            <section className="mt-8">
              <h2 className="font-medium text-gray-600">Featured</h2>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                {featured.data?.map((s) => (
                  <div key={s.id} className="w-64 flex-shrink-0">
                    <SurveyCard survey={s} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Trending */}
          {(trending.data?.length ?? 0) > 0 && (
            <section className="mt-8">
              <h2 className="font-medium text-gray-600">Trending</h2>
              <div className="mt-3 space-y-3">
                {trending.data?.slice(0, 5).map((s) => <SurveyCard key={s.id} survey={s} />)}
              </div>
            </section>
          )}

          {/* Categories */}
          <section className="mt-8">
            <div className="flex flex-wrap gap-2">
              {categories.data?.map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`rounded-full px-3 py-1 text-sm transition ${
                    selectedCategories.includes(cat)
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </section>

          {/* Sort + Browse */}
          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-gray-600">All Surveys</h2>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="rounded border px-2 py-1 text-sm"
              >
                <option value="trending">Trending</option>
                <option value="newest">Newest</option>
                <option value="most_responses">Most responses</option>
              </select>
            </div>
            <div className="mt-3 space-y-3">
              {browse.data?.items.map((s) => <SurveyCard key={s.id} survey={s} />)}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
