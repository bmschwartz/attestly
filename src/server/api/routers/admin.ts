import { z } from "zod";
import { type PrismaClient } from "../../../../generated/prisma";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

/**
 * Assert the current user is an admin by fetching the isAdmin flag from the database.
 * Throws NOT_FOUND (not FORBIDDEN) to avoid revealing admin routes exist.
 */
async function assertAdmin(ctx: { db: PrismaClient; userId: string }) {
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
}

export const adminRouter = createTRPCRouter({
  searchSurveys: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx);
      return ctx.db.survey.findMany({
        where: {
          status: "PUBLISHED",
          isPrivate: false,
          accessMode: "OPEN",
          title: { contains: input.query, mode: "insensitive" },
        },
        select: { id: true, title: true, slug: true },
        take: 10,
      });
    }),

  featureSurvey: protectedProcedure
    .input(z.object({ surveyId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx);
      const featuredCount = await ctx.db.survey.count({
        where: { featuredAt: { not: null } },
      });
      if (featuredCount >= 6) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 6 featured surveys" });
      }
      return ctx.db.survey.update({
        where: { id: input.surveyId },
        data: { featuredAt: new Date(), featuredOrder: featuredCount },
      });
    }),

  unfeatureSurvey: protectedProcedure
    .input(z.object({ surveyId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx);
      return ctx.db.survey.update({
        where: { id: input.surveyId },
        data: { featuredAt: null, featuredOrder: null },
      });
    }),

  reorderFeatured: protectedProcedure
    .input(z.object({
      surveyIds: z.array(z.uuid()),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx);
      await ctx.db.$transaction(
        input.surveyIds.map((id, index) =>
          ctx.db.survey.update({
            where: { id },
            data: { featuredOrder: index },
          }),
        ),
      );
      return { success: true };
    }),

  setUserPlan: protectedProcedure
    .input(z.object({
      userId: z.uuid(),
      plan: z.enum(["FREE", "PREMIUM", "ENTERPRISE"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx);
      return ctx.db.subscription.update({
        where: { userId: input.userId },
        data: { plan: input.plan },
      });
    }),
});
