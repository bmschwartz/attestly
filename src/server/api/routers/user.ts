import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const userRouter = createTRPCRouter({
  getProfile: publicProcedure
    .input(z.object({ userId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          displayName: true,
          avatar: true,
          bio: true,
          walletAddress: true,
          createdAt: true,
        },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const [surveyCount, responseCount] = await Promise.all([
        ctx.db.survey.count({
          where: {
            creatorId: input.userId,
            status: { in: ["PUBLISHED", "CLOSED"] },
            isPrivate: false,
            accessMode: "OPEN",
          },
        }),
        ctx.db.response.count({
          where: {
            survey: {
              creatorId: input.userId,
              isPrivate: false,
              accessMode: "OPEN",
            },
            status: "SUBMITTED",
            deletedAt: null,
          },
        }),
      ]);

      return { ...user, surveyCount, responseCount };
    }),

  getPublicSurveys: publicProcedure
    .input(z.object({
      userId: z.uuid(),
      cursor: z.uuid().optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const surveys = await ctx.db.survey.findMany({
        where: {
          creatorId: input.userId,
          status: { in: ["PUBLISHED", "CLOSED"] },
          isPrivate: false,
          accessMode: "OPEN",
        },
        include: {
          creator: { select: { id: true, displayName: true, walletAddress: true } },
          _count: { select: { responses: { where: { status: "SUBMITTED", deletedAt: null } } } },
        },
        orderBy: { publishedAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      const hasMore = surveys.length > input.limit;
      const items = hasMore ? surveys.slice(0, -1) : surveys;
      return { items, nextCursor: hasMore ? items[items.length - 1]?.id : undefined };
    }),

  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.subscription.findUnique({
      where: { userId: ctx.userId },
      select: { plan: true, status: true, currentPeriodEnd: true },
    });
  }),

  /** Get the authenticated user's own profile (for settings page). */
  getMe: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        displayName: true,
        avatar: true,
        bio: true,
        email: true,
        walletAddress: true,
        createdAt: true,
      },
    });
  }),
});
