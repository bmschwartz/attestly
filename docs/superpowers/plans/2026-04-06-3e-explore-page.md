# Explore Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public survey marketplace with keyword search, featured/trending sections, category filtering, and paginated browsing.

**Architecture:** Explore tRPC router with search, featured, trending, browse, and categories procedures. Public page with multiple sections — search bar, featured cards (horizontal scroll), trending list, category filter pills, and paginated survey list.

**Tech Stack:** Next.js App Router, tRPC 11, Prisma 7, Tailwind CSS

**Spec reference:** `docs/superpowers/specs/2026-04-05-public-survey-discovery-design.md`

---

### Task 1: Create explore router

**Files:**
- Create: `src/server/api/routers/explore.ts`
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Create router with all procedures**

```typescript
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const PLATFORM_CATEGORIES = [
  "Business", "Education", "Research", "Health", "Technology",
  "Politics", "Entertainment", "Science", "Community", "Other",
] as const;

export const exploreRouter = createTRPCRouter({
  categories: publicProcedure.query(() => {
    return PLATFORM_CATEGORIES;
  }),

  search: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.survey.findMany({
        where: {
          status: "PUBLISHED",
          isPrivate: false,
          accessMode: "OPEN",
          OR: [
            { title: { contains: input.query, mode: "insensitive" } },
            { description: { contains: input.query, mode: "insensitive" } },
          ],
        },
        include: {
          creator: { select: { id: true, displayName: true, walletAddress: true } },
          _count: { select: { responses: { where: { status: "SUBMITTED", deletedAt: null } } } },
        },
        orderBy: { publishedAt: "desc" },
        take: 20,
      });
    }),

  featured: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.survey.findMany({
      where: {
        featuredAt: { not: null },
        status: "PUBLISHED",
        isPrivate: false,
        accessMode: "OPEN",
      },
      include: {
        creator: { select: { id: true, displayName: true, walletAddress: true } },
        _count: { select: { responses: { where: { status: "SUBMITTED", deletedAt: null } } } },
      },
      orderBy: { featuredOrder: "asc" },
      take: 6,
    });
  }),

  trending: publicProcedure.query(async ({ ctx }) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get published open surveys with recent response counts
    const surveys = await ctx.db.survey.findMany({
      where: {
        status: "PUBLISHED",
        isPrivate: false,
        accessMode: "OPEN",
      },
      include: {
        creator: { select: { id: true, displayName: true, walletAddress: true } },
        _count: {
          select: {
            responses: {
              where: {
                status: "SUBMITTED",
                deletedAt: null,
                submittedAt: { gte: sevenDaysAgo },
              },
            },
          },
        },
      },
    });

    // Sort by recent response count descending
    return surveys
      .filter((s) => s._count.responses > 0)
      .sort((a, b) => b._count.responses - a._count.responses)
      .slice(0, 10);
  }),

  browse: publicProcedure
    .input(
      z.object({
        categories: z.array(z.string()).optional(),
        sort: z.enum(["trending", "newest", "most_responses"]).default("trending"),
        cursor: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        status: "PUBLISHED" as const,
        isPrivate: false,
        accessMode: "OPEN" as const,
        ...(input.categories?.length
          ? {
              categories: {
                array_contains: input.categories,
              },
            }
          : {}),
      };

      const orderBy =
        input.sort === "newest"
          ? { publishedAt: "desc" as const }
          : input.sort === "most_responses"
            ? undefined // handled below
            : { publishedAt: "desc" as const }; // trending fallback

      const surveys = await ctx.db.survey.findMany({
        where,
        include: {
          creator: { select: { id: true, displayName: true, walletAddress: true } },
          _count: { select: { responses: { where: { status: "SUBMITTED", deletedAt: null } } } },
        },
        orderBy: orderBy ? orderBy : undefined,
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      const hasMore = surveys.length > input.limit;
      const items = hasMore ? surveys.slice(0, -1) : surveys;
      const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

      // Sort by response count if needed
      if (input.sort === "most_responses") {
        items.sort((a, b) => b._count.responses - a._count.responses);
      }

      return { items, nextCursor };
    }),
});
```

- [ ] **Step 2: Register in root.ts**

```typescript
import { exploreRouter } from "~/server/api/routers/explore";
// Add: explore: exploreRouter
```

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/explore.ts src/server/api/root.ts
git commit -m "feat: add explore router (search, featured, trending, browse)"
```

---

### Task 2: Create shared SurveyCard component

**Files:**
- Create: `src/app/_components/survey-card.tsx`

- [ ] **Step 1: Create the component**

```typescript
import Link from "next/link";

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
  const categories = (survey.categories as string[]) ?? [];
  const tags = (survey.tags as string[]) ?? [];
  const timeAgo = survey.publishedAt ? getTimeAgo(survey.publishedAt) : "";

  return (
    <Link
      href={`/s/${survey.slug}`}
      className="block rounded-lg border border-gray-200 p-4 transition hover:border-gray-300 hover:shadow-sm"
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
    </Link>
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/survey-card.tsx
git commit -m "feat: add shared SurveyCard component"
```

---

### Task 3: Create ExplorePage

**Files:**
- Create: `src/app/explore/page.tsx`

- [ ] **Step 1: Create the explore page with all sections**

```typescript
"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { SurveyCard } from "~/app/_components/survey-card";

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sort, setSort] = useState<"trending" | "newest" | "most_responses">("trending");

  const isSearching = searchQuery.length > 0;
  const categories = api.explore.categories.useQuery();
  const featured = api.explore.featured.useQuery(undefined, { enabled: !isSearching });
  const trending = api.explore.trending.useQuery(undefined, { enabled: !isSearching });
  const searchResults = api.explore.search.useQuery(
    { query: searchQuery },
    { enabled: isSearching },
  );
  const browse = api.explore.browse.useQuery(
    { categories: selectedCategories.length > 0 ? selectedCategories : undefined, sort },
    { enabled: !isSearching },
  );

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">Explore Surveys</h1>

      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search surveys..."
        className="mt-4 w-full rounded-lg border px-4 py-3 text-lg"
      />

      {isSearching ? (
        <div className="mt-6 space-y-3">
          <h2 className="font-medium text-gray-600">Search results</h2>
          {searchResults.data?.map((s) => <SurveyCard key={s.id} survey={s} />)}
          {searchResults.data?.length === 0 && (
            <p className="text-gray-400">No surveys found</p>
          )}
        </div>
      ) : (
        <>
          {/* Featured */}
          {(featured.data?.length ?? 0) > 0 && (
            <section className="mt-8">
              <h2 className="font-medium text-gray-600">Featured</h2>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                {featured.data?.map((s) => (
                  <div key={s.id} className="w-64 flex-shrink-0">
                    <SurveyCard survey={s} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Trending */}
          {(trending.data?.length ?? 0) > 0 && (
            <section className="mt-8">
              <h2 className="font-medium text-gray-600">Trending</h2>
              <div className="mt-3 space-y-3">
                {trending.data?.slice(0, 5).map((s) => <SurveyCard key={s.id} survey={s} />)}
              </div>
            </section>
          )}

          {/* Categories */}
          <section className="mt-8">
            <div className="flex flex-wrap gap-2">
              {categories.data?.map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`rounded-full px-3 py-1 text-sm transition ${
                    selectedCategories.includes(cat)
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </section>

          {/* Sort + Browse */}
          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-gray-600">All Surveys</h2>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="rounded border px-2 py-1 text-sm"
              >
                <option value="trending">Trending</option>
                <option value="newest">Newest</option>
                <option value="most_responses">Most responses</option>
              </select>
            </div>
            <div className="mt-3 space-y-3">
              {browse.data?.items.map((s) => <SurveyCard key={s.id} survey={s} />)}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/explore/page.tsx
git commit -m "feat: add explore page with search, featured, trending, category filtering"
```

---

## Verification Checklist

- [ ] `pnpm typecheck` — no errors
- [ ] Explore router: search, featured, trending, browse, categories — all public
- [ ] Only public + published + open-access surveys appear
- [ ] Search works across titles and descriptions
- [ ] Featured shows max 6 admin-curated surveys
- [ ] Trending sorts by recent response count (last 7 days)
- [ ] Category pills filter with OR logic
- [ ] Sort options: trending, newest, most responses
- [ ] SurveyCard is shared and reusable
