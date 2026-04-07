"use client";

import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { usePremium } from "~/hooks/use-premium";
import { FREE_TIER_LIMITS } from "~/lib/premium";

const STATUS_TABS = ["ALL", "DRAFT", "PUBLISHED", "CLOSED"] as const;
const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "alphabetical", label: "Alphabetical" },
] as const;

export type StatusFilter = (typeof STATUS_TABS)[number];
export type SortOption = (typeof SORT_OPTIONS)[number]["value"];

export function SurveyListHeader({
  statusFilter,
  sortOption,
  onStatusChange,
  onSortChange,
}: {
  statusFilter: StatusFilter;
  sortOption: SortOption;
  onStatusChange: (status: StatusFilter) => void;
  onSortChange: (sort: SortOption) => void;
}) {
  const router = useRouter();
  const utils = api.useUtils();

  const { data: stats } = api.survey.getStats.useQuery();
  const { isPremium } = usePremium();
  const isAtLimit = !isPremium && (stats?.totalSurveys ?? 0) >= FREE_TIER_LIMITS.maxSurveys;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Your Surveys</h2>
        <button
          onClick={() => router.push("/surveys/new")}
          disabled={isAtLimit}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          title={
            isAtLimit
              ? "You've reached the free plan limit of 5 surveys. Upgrade for unlimited."
              : undefined
          }
        >
          + New Survey
        </button>
      </div>

      {isAtLimit && (
        <p className="text-sm text-amber-600">
          You&apos;ve reached the free plan limit of 5 surveys. Upgrade for
          unlimited.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status filter tabs */}
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => onStatusChange(tab)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === tab
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab === "ALL" ? "All" : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <select
          value={sortOption}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
