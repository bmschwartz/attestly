"use client";

import { useMemo, useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";
import { OverviewStats } from "./overview-stats";
import {
  SurveyListHeader,
  type StatusFilter,
  type SortOption,
} from "./survey-list-header";
import { SurveyCard } from "./survey-card";
import { EmptyState } from "./empty-state";

type Survey = RouterOutputs["survey"]["listMine"]["surveys"][number];

function sortSurveys(surveys: Survey[], sortOption: SortOption): Survey[] {
  return [...surveys].sort((a, b) => {
    switch (sortOption) {
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "alphabetical":
        return a.title.localeCompare(b.title);
      case "newest":
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });
}

export function SurveyList() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortOption, setSortOption] = useState<SortOption>("newest");

  const { data: stats } = api.survey.getStats.useQuery();
  const { data, isLoading } = api.survey.listMine.useQuery({
    // Omit status when "ALL" is selected; API accepts undefined for all statuses
    ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
  });

  const sortedSurveys = useMemo(
    () => sortSurveys(data?.surveys ?? [], sortOption),
    [data?.surveys, sortOption],
  );

  const hasNoSurveys = !isLoading && (stats?.totalSurveys ?? 0) === 0;

  return (
    <div className="space-y-6">
      <OverviewStats />

      {hasNoSurveys ? (
        <EmptyState />
      ) : (
        <>
          <SurveyListHeader
            statusFilter={statusFilter}
            sortOption={sortOption}
            onStatusChange={setStatusFilter}
            onSortChange={setSortOption}
          />

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-lg bg-gray-100"
                />
              ))}
            </div>
          ) : sortedSurveys.length > 0 ? (
            <div className="space-y-4">
              {sortedSurveys.map((survey) => (
                <SurveyCard key={survey.id} survey={survey} />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-gray-500">
              {statusFilter === "ALL"
                ? "No surveys yet."
                : `No ${statusFilter.toLowerCase()} surveys.`}
            </div>
          )}
        </>
      )}
    </div>
  );
}
