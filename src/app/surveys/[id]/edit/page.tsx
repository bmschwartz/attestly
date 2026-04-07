"use client";

import { useParams } from "next/navigation";
import { AuthGuard } from "~/app/_components/auth-guard";

export default function SurveyEditPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <AuthGuard>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900">Edit Survey</h1>
        <p className="mt-4 text-gray-600">Survey ID: {id}</p>
      </div>
    </AuthGuard>
  );
}
