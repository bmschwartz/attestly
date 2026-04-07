"use client";

import { useParams } from "next/navigation";
import { AuthGuard } from "~/app/_components/auth-guard";

export default function SurveyRespondPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <AuthGuard>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900">Respond to Survey</h1>
        <p className="mt-4 text-gray-600">Slug: {slug}</p>
      </div>
    </AuthGuard>
  );
}
