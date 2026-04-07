"use client";

import { useParams } from "next/navigation";
import { AuthGuard } from "~/app/_components/auth-guard";

export default function SurveyConfirmationPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <AuthGuard>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900">Response Confirmed</h1>
        <p className="mt-4 text-gray-600">
          Thank you for responding to survey: {slug}
        </p>
      </div>
    </AuthGuard>
  );
}
