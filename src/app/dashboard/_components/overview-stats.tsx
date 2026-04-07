"use client";

import { api } from "~/trpc/react";

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900">
        {loading ? (
          <span className="inline-block h-8 w-16 animate-pulse rounded bg-gray-200" />
        ) : (
          value
        )}
      </p>
    </div>
  );
}

export function OverviewStats() {
  const { data, isLoading } = api.survey.getStats.useQuery();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Surveys"
        value={data?.totalSurveys ?? 0}
        loading={isLoading}
      />
      <StatCard
        label="Responses"
        value={data?.totalResponses ?? 0}
        loading={isLoading}
      />
      <StatCard
        label="Active"
        value={data?.activeSurveys ?? 0}
        loading={isLoading}
      />
    </div>
  );
}
