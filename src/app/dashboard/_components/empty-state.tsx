"use client";

import { useRouter } from "next/navigation";

export function EmptyState() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-16">
      <p className="text-lg text-gray-500">
        You haven&apos;t created any surveys yet.
      </p>
      <button
        onClick={() => router.push("/surveys/new")}
        className="mt-4 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Create Your First Survey
      </button>
    </div>
  );
}
