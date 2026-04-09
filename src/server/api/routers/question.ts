import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { type db } from "~/server/db";

type DbClient = typeof db;

async function verifyDraftSurveyOwnership(
  db: DbClient,
  surveyId: string,
  userId: string,
) {
  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: { creatorId: true, status: true },
  });
  if (!survey) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
  }
  if (survey.creatorId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not your survey" });
  }
  if (survey.status !== "DRAFT") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Can only modify questions on draft surveys",
    });
  }
}

export const questionRouter = createTRPCRouter({
  upsert: protectedProcedure
    .input(
      z.object({
        surveyId: z.uuid(),
        questionId: z.uuid().optional(),
        text: z.string().min(1),
        questionType: z.enum(["SINGLE_SELECT", "MULTIPLE_CHOICE", "RATING", "FREE_TEXT"]),
        position: z.number().int().min(0),
        required: z.boolean().default(false),
        options: z.array(z.string()).default([]),
        minRating: z.number().int().nullable().default(null),
        maxRating: z.number().int().nullable().default(null),
        maxLength: z.number().int().nullable().default(null),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyDraftSurveyOwnership(ctx.db, input.surveyId, ctx.userId);

      const questionData = {
        text: input.text,
        questionType: input.questionType,
        position: input.position,
        required: input.required,
        options: input.options,
        minRating: input.minRating,
        maxRating: input.maxRating,
        maxLength: input.maxLength,
      };

      if (input.questionId) {
        // Upsert: update if exists, create if not (handles client-generated IDs)
        return ctx.db.question.upsert({
          where: { id: input.questionId },
          update: questionData,
          create: {
            id: input.questionId,
            surveyId: input.surveyId,
            ...questionData,
          },
        });
      }

      return ctx.db.question.create({
        data: {
          surveyId: input.surveyId,
          ...questionData,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ questionId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const question = await ctx.db.question.findUnique({
        where: { id: input.questionId },
        select: { surveyId: true, position: true },
      });
      if (!question) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Question not found" });
      }

      await verifyDraftSurveyOwnership(ctx.db, question.surveyId, ctx.userId);

      await ctx.db.$transaction(async (tx) => {
        await tx.question.delete({ where: { id: input.questionId } });
        await tx.question.updateMany({
          where: {
            surveyId: question.surveyId,
            position: { gt: question.position },
          },
          data: { position: { decrement: 1 } },
        });
      });

      return { success: true };
    }),

  batchUpsert: protectedProcedure
    .input(
      z.object({
        surveyId: z.string(),
        questions: z.array(
          z.object({
            questionId: z.uuid(),
            text: z.string().min(1).max(500),
            questionType: z.enum(["SINGLE_SELECT", "MULTIPLE_CHOICE", "RATING", "FREE_TEXT"]),
            position: z.number().int().min(0).max(255),
            required: z.boolean().default(false),
            options: z.array(z.string()).default([]),
            minRating: z.number().int().nullable().default(null),
            maxRating: z.number().int().nullable().default(null),
            maxLength: z.number().int().nullable().default(null),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await verifyDraftSurveyOwnership(ctx.db, input.surveyId, ctx.userId);

      return ctx.db.$transaction(async (tx) => {
        // Set each existing question to a unique negative position to avoid
        // unique constraint collisions on (surveyId, position) during upserts.
        const existing = await tx.question.findMany({
          where: { surveyId: input.surveyId },
          select: { id: true },
        });
        for (let i = 0; i < existing.length; i++) {
          await tx.question.update({
            where: { id: existing[i]!.id },
            data: { position: -(i + 1) },
          });
        }

        // Upsert each question with the correct position
        const results = [];
        for (const q of input.questions) {
          const data = {
            text: q.text,
            questionType: q.questionType,
            position: q.position,
            required: q.required,
            options: q.options,
            minRating: q.minRating,
            maxRating: q.maxRating,
            maxLength: q.maxLength,
          };
          const result = await tx.question.upsert({
            where: { id: q.questionId },
            update: data,
            create: { id: q.questionId, surveyId: input.surveyId, ...data },
          });
          results.push(result);
        }

        // Delete questions that are in the DB but not in the input (removed by user)
        const inputIds = input.questions.map((q) => q.questionId);
        await tx.question.deleteMany({
          where: {
            surveyId: input.surveyId,
            id: { notIn: inputIds },
          },
        });

        return results;
      });
    }),

  reorder: protectedProcedure
    .input(
      z.object({
        questionId: z.uuid(),
        direction: z.enum(["up", "down"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const question = await ctx.db.question.findUnique({
        where: { id: input.questionId },
        select: { id: true, surveyId: true, position: true },
      });
      if (!question) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Question not found" });
      }

      await verifyDraftSurveyOwnership(ctx.db, question.surveyId, ctx.userId);

      const targetPosition =
        input.direction === "up" ? question.position - 1 : question.position + 1;

      const adjacent = await ctx.db.question.findUnique({
        where: {
          surveyId_position: {
            surveyId: question.surveyId,
            position: targetPosition,
          },
        },
        select: { id: true },
      });

      if (!adjacent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot move ${input.direction} — already at the ${input.direction === "up" ? "top" : "bottom"}`,
        });
      }

      const tempPosition = -1;
      await ctx.db.$transaction(async (tx) => {
        await tx.question.update({ where: { id: question.id }, data: { position: tempPosition } });
        await tx.question.update({ where: { id: adjacent.id }, data: { position: question.position } });
        await tx.question.update({ where: { id: question.id }, data: { position: targetPosition } });
      });

      return { success: true };
    }),
});
