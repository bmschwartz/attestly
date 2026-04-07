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

  createSession: protectedProcedure
    .input(z.object({
      surveyId: z.string().uuid().nullable(),
      surveyIds: z.array(z.string().uuid()).optional(),
      title: z.string().default("New conversation"),
    }))
    .mutation(async ({ ctx, input }) => {
      // Premium check
      const subscription = await ctx.db.subscription.findUnique({ where: { userId: ctx.userId } });
      if (!subscription || subscription.plan === "FREE") {
        throw new TRPCError({ code: "FORBIDDEN", message: "AI Chat requires Premium" });
      }
      return ctx.db.chatSession.create({
        data: {
          userId: ctx.userId,
          surveyId: input.surveyId,
          surveyIds: input.surveyIds ?? null,
          title: input.title,
          messages: [],
        },
      });
    }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.db.chatSession.findUnique({ where: { id: input.sessionId } });
      if (!session || session.userId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return session;
    }),

  listSessions: protectedProcedure
    .input(z.object({ surveyId: z.string().uuid().nullable() }))
    .query(async ({ ctx, input }) => {
      if (input.surveyId) {
        return ctx.db.chatSession.findMany({
          where: { userId: ctx.userId, surveyId: input.surveyId },
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true, updatedAt: true },
        });
      }
      // Cross-survey sessions
      return ctx.db.chatSession.findMany({
        where: { userId: ctx.userId, surveyId: null },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, surveyIds: true, updatedAt: true },
      });
    }),

  renameSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid(), title: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.chatSession.findUnique({ where: { id: input.sessionId } });
      if (!session || session.userId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return ctx.db.chatSession.update({
        where: { id: input.sessionId },
        data: { title: input.title },
      });
    }),

  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.chatSession.findUnique({ where: { id: input.sessionId } });
      if (!session || session.userId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await ctx.db.chatSession.delete({ where: { id: input.sessionId } });
      return { success: true };
    }),

  chat: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      message: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.db.chatSession.findUnique({ where: { id: input.sessionId } });
      if (!session || session.userId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Load survey data
      const surveyIds = session.surveyId
        ? [session.surveyId]
        : (session.surveyIds as string[]) ?? [];

      const surveys = await Promise.all(
        surveyIds.map(async (id) => {
          const survey = await ctx.db.survey.findUnique({
            where: { id },
            include: { questions: { include: { answers: true }, orderBy: { position: "asc" } } },
          });
          if (!survey) throw new TRPCError({ code: "NOT_FOUND", message: `Survey ${id} not found` });
          const totalResponses = await ctx.db.response.count({
            where: { surveyId: id, status: "SUBMITTED", deletedAt: null },
          });
          return { ...survey, totalResponses };
        }),
      );

      const messages = (session.messages as { role: "user" | "assistant"; content: string }[]) ?? [];

      // Call LLM
      const { chatWithData } = await import("~/server/ai/chat");
      const response = await chatWithData(surveys, messages, input.message);

      // Auto-generate title from first message
      const isFirstMessage = messages.length === 0;
      const newTitle = isFirstMessage ? input.message.slice(0, 50) + (input.message.length > 50 ? "..." : "") : session.title;

      // Append messages and update session
      const updatedMessages = [
        ...messages,
        { role: "user" as const, content: input.message, timestamp: new Date().toISOString() },
        { role: "assistant" as const, content: response, timestamp: new Date().toISOString() },
      ];

      await ctx.db.chatSession.update({
        where: { id: input.sessionId },
        data: {
          messages: updatedMessages,
          title: newTitle,
        },
      });

      return { response, title: newTitle };
    }),
});
