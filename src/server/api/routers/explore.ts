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
      const baseWhere = {
        status: "PUBLISHED" as const,
        isPrivate: false,
        accessMode: "OPEN" as const,
      };

      const orderBy =
        input.sort === "newest"
          ? { publishedAt: "desc" as const }
          : input.sort === "most_responses"
            ? undefined // handled below
            : { publishedAt: "desc" as const }; // trending fallback

      // Filter categories in application code since Prisma doesn't support
      // array_contains on Json columns for PostgreSQL
      const allSurveys = await ctx.db.survey.findMany({
        where: baseWhere,
        include: {
          creator: { select: { id: true, displayName: true, walletAddress: true } },
          _count: { select: { responses: { where: { status: "SUBMITTED", deletedAt: null } } } },
        },
        orderBy: orderBy ? orderBy : undefined,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      const filtered = input.categories?.length
        ? allSurveys.filter((s) => {
            const cats = (s.categories as string[]) ?? [];
            return input.categories!.some((c) => cats.includes(c));
          })
        : allSurveys;

      const paginated = filtered.slice(0, input.limit + 1);
      const hasMore = paginated.length > input.limit;
      const items = hasMore ? paginated.slice(0, -1) : paginated;
      const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

      // Sort by response count if needed
      if (input.sort === "most_responses") {
        items.sort((a, b) => b._count.responses - a._count.responses);
      }

      return { items, nextCursor };
    }),
});
