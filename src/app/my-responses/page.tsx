"use client";

import Link from "next/link";
import { AuthGuard } from "~/app/_components/auth-guard";
import { ResponseCard } from "~/app/_components/response-card";
import { api } from "~/trpc/react";

function MyResponsesContent() {
  const { data: responses, isLoading, error } = api.response.listMine.useQuery();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900">My Responses</h1>
        <p className="mt-4 text-gray-500">Loading your responses...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900">My Responses</h1>
        <p className="mt-4 text-red-600">
          Failed to load responses. Please try again.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900">My Responses</h1>
      <p className="mt-1 text-sm text-gray-500">
        Surveys you&apos;ve participated in
      </p>

      {!responses || responses.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-gray-500">
            You haven&apos;t responded to any surveys yet.
          </p>
          <Link
            href="/"
            className="mt-2 inline-block text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Explore surveys &rarr;
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {responses.map((response) => (
            <ResponseCard key={response.id} response={response} />
          ))}
        </div>
      )}
    </main>
  );
}

export default function MyResponsesPage() {
  return (
    <AuthGuard>
      <MyResponsesContent />
    </AuthGuard>
  );
}
