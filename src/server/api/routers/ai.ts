import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const aiRouter = createTRPCRouter({
  getSummaries: protectedProcedure
    .input(z.object({ surveyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Premium check
      const subscription = await ctx.db.subscription.findUnique({
        where: { userId: ctx.userId },
      });
      if (!subscription || subscription.plan === "FREE") {
        throw new TRPCError({ code: "FORBIDDEN", message: "AI Insights requires a Premium subscription" });
      }

      return ctx.db.aiSummary.findMany({
        where: { surveyId: input.surveyId },
        orderBy: { generatedAt: "desc" },
      });
    }),

  regenerateSummary: protectedProcedure
    .input(
      z.object({
        surveyId: z.string().uuid(),
        questionId: z.string().uuid().nullable(),
        focusPrompt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Premium check
      const subscription = await ctx.db.subscription.findUnique({
        where: { userId: ctx.userId },
      });
      if (!subscription || subscription.plan === "FREE") {
        throw new TRPCError({ code: "FORBIDDEN", message: "AI Insights requires a Premium subscription" });
      }

      // Verify creator owns the survey
      const survey = await ctx.db.survey.findUnique({
        where: { id: input.surveyId },
        select: { creatorId: true },
      });
      if (!survey || survey.creatorId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your survey" });
      }

      // Queue regeneration job
      await ctx.db.backgroundJob.create({
        data: {
          type: "GENERATE_AI_SUMMARY",
          surveyId: input.surveyId,
          payload: {
            surveyId: input.surveyId,
            questionId: input.questionId,
            focusPrompt: input.focusPrompt,
          },
        },
      });

      return { queued: true };
    }),
});
