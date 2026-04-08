import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";

export const responseRouter = createTRPCRouter({
  start: protectedProcedure
    .input(z.object({ surveyId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check survey exists and is published
      const survey = await ctx.db.survey.findUnique({
        where: { id: input.surveyId },
        select: { id: true, status: true, accessMode: true, creatorId: true },
      });
      if (survey?.status !== "PUBLISHED") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found or not published" });
      }

      // Check for existing active response
      const existing = await ctx.db.response.findFirst({
        where: {
          surveyId: input.surveyId,
          respondentId: ctx.userId,
          deletedAt: null,
        },
        include: { answers: true },
      });
      if (existing) {
        return existing;
      }

      // Free tier response limit check
      const creator = await ctx.db.user.findUnique({
        where: { id: survey.creatorId },
        include: { subscription: true },
      });
      if (!creator?.subscription || creator.subscription.plan === "FREE") {
        const responseCount = await ctx.db.response.count({
          where: {
            surveyId: input.surveyId,
            status: { in: ["SUBMITTED", "SUBMITTING"] },
            deletedAt: null,
          },
        });
        if (responseCount >= 50) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This survey has reached its response limit",
          });
        }
      }

      // Create new IN_PROGRESS response
      return ctx.db.response.create({
        data: {
          surveyId: input.surveyId,
          respondentId: ctx.userId,
          status: "IN_PROGRESS",
        },
        include: { answers: true },
      });
    }),

  saveAnswer: protectedProcedure
    .input(
      z.object({
        responseId: z.uuid(),
        questionId: z.uuid(),
        questionIndex: z.number().int(),
        questionType: z.enum(["SINGLE_SELECT", "MULTIPLE_CHOICE", "RATING", "FREE_TEXT"]),
        value: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify response belongs to user and is IN_PROGRESS
      const response = await ctx.db.response.findUnique({
        where: { id: input.responseId },
        select: { respondentId: true, status: true },
      });
      if (response?.respondentId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Response not found" });
      }
      if (response.status !== "IN_PROGRESS") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Response already submitted" });
      }

      // Upsert answer
      return ctx.db.answer.upsert({
        where: {
          responseId_questionId: {
            responseId: input.responseId,
            questionId: input.questionId,
          },
        },
        update: { value: input.value },
        create: {
          responseId: input.responseId,
          questionId: input.questionId,
          questionIndex: input.questionIndex,
          questionType: input.questionType,
          value: input.value,
        },
      });
    }),

  submit: protectedProcedure
    .input(z.object({
      responseId: z.uuid(),
      signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Must be a valid EIP-712 signature"),
    }))
    .mutation(async ({ ctx, input }) => {
      const response = await ctx.db.response.findUnique({
        where: { id: input.responseId },
        include: {
          survey: { include: { questions: true } },
          answers: true,
        },
      });
      if (response?.respondentId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Response not found" });
      }
      if (response.status !== "IN_PROGRESS") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Response already submitted" });
      }
      if (response.survey.status !== "PUBLISHED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Survey is no longer accepting responses" });
      }

      // Validate required questions are answered
      const requiredQuestionIds = response.survey.questions
        .filter((q) => q.required)
        .map((q) => q.id);
      const answeredQuestionIds = new Set(response.answers.map((a) => a.questionId));
      const unanswered = requiredQuestionIds.filter((id) => !answeredQuestionIds.has(id));
      if (unanswered.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Missing required answers for ${unanswered.length} question(s)`,
        });
      }

      return ctx.db.$transaction(async (tx) => {
        // Transition to SUBMITTING (handler sets SUBMITTED on success)
        const submitting = await tx.response.update({
          where: { id: input.responseId },
          data: {
            status: "SUBMITTING",
          },
        });

        // Enqueue SUBMIT_RESPONSE job
        await tx.backgroundJob.create({
          data: {
            type: "SUBMIT_RESPONSE",
            surveyId: response.surveyId,
            responseId: response.id,
            payload: {
              responseId: response.id,
              signature: input.signature,
            },
          },
        });

        return submitting;
      });
    }),

  clear: protectedProcedure
    .input(z.object({ responseId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const response = await ctx.db.response.findUnique({
        where: { id: input.responseId },
        select: { respondentId: true, status: true },
      });
      if (response?.respondentId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Response not found" });
      }
      if (response.status !== "IN_PROGRESS") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot clear a submitted response" });
      }

      // Delete all answers for this response
      await ctx.db.answer.deleteMany({
        where: { responseId: input.responseId },
      });

      return { success: true };
    }),

  getConfirmation: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;

      const survey = await ctx.db.survey.findUnique({
        where: { slug: input.slug },
        select: {
          id: true,
          title: true,
          status: true,
          closedAt: true,
          resultsVisibility: true,
        },
      });

      if (!survey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Survey not found",
        });
      }

      const response = await ctx.db.response.findFirst({
        where: {
          surveyId: survey.id,
          respondentId: userId,
          status: "SUBMITTED",
          deletedAt: null,
        },
        select: {
          id: true,
          submittedAt: true,
          blindedId: true,
          ipfsCid: true,
          submitTxHash: true,
          verificationStatus: true,
        },
      });

      if (!response) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No submitted response found for this survey",
        });
      }

      const user = await ctx.db.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      return {
        survey: {
          title: survey.title,
          status: survey.status,
          closedAt: survey.closedAt,
          resultsVisibility: survey.resultsVisibility,
        },
        response: {
          id: response.id,
          submittedAt: response.submittedAt,
          blindedId: response.blindedId,
          ipfsCid: response.ipfsCid,
          submitTxHash: response.submitTxHash,
          verificationStatus: response.verificationStatus,
        },
        respondentEmail: user?.email ?? null,
      };
    }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    const responses = await ctx.db.response.findMany({
      where: {
        respondentId: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        blindedId: true,
        createdAt: true,
        survey: {
          select: {
            id: true,
            title: true,
            slug: true,
            status: true,
            closedAt: true,
            resultsVisibility: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return responses.map((r) => ({
      id: r.id,
      status: r.status,
      submittedAt: r.submittedAt,
      blindedId: r.blindedId,
      createdAt: r.createdAt,
      survey: {
        id: r.survey.id,
        title: r.survey.title,
        slug: r.survey.slug,
        status: r.survey.status,
        closedAt: r.survey.closedAt,
        resultsVisibility: r.survey.resultsVisibility,
      },
    }));
  }),
});
