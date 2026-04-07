"use client";

import { AuthGuard } from "~/app/_components/auth-guard";

export default function DashboardInsightsPage() {
  return (
    <AuthGuard>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900">Insights</h1>
        <p className="mt-4 text-gray-600">Survey analytics and insights.</p>
      </div>
    </AuthGuard>
  );
}
