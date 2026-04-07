"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

interface SurveyCardProps {
  survey: {
    id: string;
    title: string;
    slug: string;
    categories: unknown; // Json type
    tags: unknown; // Json type
    publishedAt: Date | null;
    creator: { id: string; displayName: string | null; walletAddress: string };
    _count: { responses: number };
  };
}

export function SurveyCard({ survey }: SurveyCardProps) {
  const router = useRouter();
  const categories = (survey.categories as string[]) ?? [];
  const tags = (survey.tags as string[]) ?? [];
  const timeAgo = survey.publishedAt ? getTimeAgo(survey.publishedAt) : "";

  return (
    <div
      onClick={() => router.push(`/s/${survey.slug}`)}
      className="block cursor-pointer rounded-lg border border-gray-200 p-4 transition hover:border-gray-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between">
        <h3 className="font-medium">{survey.title}</h3>
        {categories[0] && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {categories[0]}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-500">
        by{" "}
        <Link
          href={`/u/${survey.creator.id}`}
          className="hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {survey.creator.displayName ?? survey.creator.walletAddress.slice(0, 10) + "..."}
        </Link>
        {" · "}
        {survey._count.responses} responses
        {timeAgo && ` · ${timeAgo}`}
      </p>
      {tags.length > 0 && (
        <div className="mt-2 flex gap-1">
          {tags.slice(0, 5).map((tag) => (
            <span key={tag} className="text-xs text-gray-400">#{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}
