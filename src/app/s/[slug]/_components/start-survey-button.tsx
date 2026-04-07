"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";

export function StartSurveyButton({ slug }: { slug: string }) {
  const { authenticated, login } = usePrivy();
  const router = useRouter();

  const handleClick = () => {
    if (!authenticated) {
      login();
      return;
    }
    router.push(`/s/${slug}/respond`);
  };

  return (
    <button
      onClick={handleClick}
      className="mt-8 inline-block rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
    >
      Start Survey
    </button>
  );
}
