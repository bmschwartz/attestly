import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "../../../../generated/prisma";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";

// ------------------------------------------------------------------
// Aggregation helpers
// ------------------------------------------------------------------

type SelectAggregation = {
  questionId: string;
  questionText: string;
  questionType: "SINGLE_SELECT" | "MULTIPLE_CHOICE";
  position: number;
  options: string[];
  totalResponses: number;
  optionCounts: { value: string; count: number; percentage: number }[];
};

type RatingAggregation = {
  questionId: string;
  questionText: string;
  questionType: "RATING";
  position: number;
  minRating: number;
  maxRating: number;
  totalResponses: number;
  average: number;
  distribution: { value: number; count: number; percentage: number }[];
};

type FreeTextAggregation = {
  questionId: string;
  questionText: string;
  questionType: "FREE_TEXT";
  position: number;
  totalResponses: number;
  responses: { value: string; submittedAt: Date }[];
  page: number;
  totalPages: number;
};

type QuestionAggregation = SelectAggregation | RatingAggregation | FreeTextAggregation;

async function aggregateSelectQuestion(
  db: PrismaClient,
  question: {
    id: string;
    text: string;
    questionType: "SINGLE_SELECT" | "MULTIPLE_CHOICE";
    position: number;
    options: unknown;
  },
  surveyId: string,
): Promise<SelectAggregation> {
  const options = question.options as string[];

  const answers = await db.answer.findMany({
    where: {
      questionId: question.id,
      response: {
        surveyId,
        status: "SUBMITTED",
        deletedAt: null,
      },
    },
    select: { value: true },
  });

  if (question.questionType === "SINGLE_SELECT") {
    const countMap = new Map<string, number>();
    for (const opt of options) {
      countMap.set(opt, 0);
    }
    for (const answer of answers) {
      const current = countMap.get(answer.value) ?? 0;
      countMap.set(answer.value, current + 1);
    }

    const totalResponses = answers.length;
    const optionCounts = options.map((opt) => {
      const count = countMap.get(opt) ?? 0;
      return {
        value: opt,
        count,
        percentage: totalResponses > 0 ? Math.round((count / totalResponses) * 1000) / 10 : 0,
      };
    });

    return {
      questionId: question.id,
      questionText: question.text,
      questionType: "SINGLE_SELECT",
      position: question.position,
      options,
      totalResponses,
      optionCounts,
    };
  }

  // MULTIPLE_CHOICE: each answer is a JSON array of selected options
  const countMap = new Map<string, number>();
  for (const opt of options) {
    countMap.set(opt, 0);
  }
  for (const answer of answers) {
    let selected: string[];
    try {
      selected = JSON.parse(answer.value) as string[];
    } catch {
      continue;
    }
    for (const sel of selected) {
      const current = countMap.get(sel) ?? 0;
      countMap.set(sel, current + 1);
    }
  }

  const totalResponses = answers.length;
  const optionCounts = options.map((opt) => {
    const count = countMap.get(opt) ?? 0;
    return {
      value: opt,
      count,
      percentage: totalResponses > 0 ? Math.round((count / totalResponses) * 1000) / 10 : 0,
    };
  });

  return {
    questionId: question.id,
    questionText: question.text,
    questionType: "MULTIPLE_CHOICE",
    position: question.position,
    options,
    totalResponses,
    optionCounts,
  };
}

async function aggregateRatingQuestion(
  db: PrismaClient,
  question: {
    id: string;
    text: string;
    position: number;
    minRating: number | null;
    maxRating: number | null;
  },
  surveyId: string,
): Promise<RatingAggregation> {
  const minRating = question.minRating ?? 1;
  const maxRating = question.maxRating ?? 5;

  const answers = await db.answer.findMany({
    where: {
      questionId: question.id,
      response: {
        surveyId,
        status: "SUBMITTED",
        deletedAt: null,
      },
    },
    select: { value: true },
  });

  const countMap = new Map<number, number>();
  for (let i = minRating; i <= maxRating; i++) {
    countMap.set(i, 0);
  }

  let sum = 0;
  let validCount = 0;
  for (const answer of answers) {
    const val = parseInt(answer.value, 10);
    if (!isNaN(val) && val >= minRating && val <= maxRating) {
      const current = countMap.get(val) ?? 0;
      countMap.set(val, current + 1);
      sum += val;
      validCount++;
    }
  }

  const average = validCount > 0 ? Math.round((sum / validCount) * 10) / 10 : 0;

  const distribution: { value: number; count: number; percentage: number }[] = [];
  for (let i = minRating; i <= maxRating; i++) {
    const count = countMap.get(i) ?? 0;
    distribution.push({
      value: i,
      count,
      percentage: validCount > 0 ? Math.round((count / validCount) * 1000) / 10 : 0,
    });
  }

  return {
    questionId: question.id,
    questionText: question.text,
    questionType: "RATING",
    position: question.position,
    minRating,
    maxRating,
    totalResponses: validCount,
    average,
    distribution,
  };
}

async function aggregateFreeTextQuestion(
  db: PrismaClient,
  question: {
    id: string;
    text: string;
    position: number;
  },
  surveyId: string,
  page: number,
  pageSize: number,
): Promise<FreeTextAggregation> {
  const totalResponses = await db.answer.count({
    where: {
      questionId: question.id,
      response: {
        surveyId,
        status: "SUBMITTED",
        deletedAt: null,
      },
    },
  });

  const totalPages = Math.max(1, Math.ceil(totalResponses / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);

  const answers = await db.answer.findMany({
    where: {
      questionId: question.id,
      response: {
        surveyId,
        status: "SUBMITTED",
        deletedAt: null,
      },
    },
    select: {
      value: true,
      response: {
        select: { submittedAt: true },
      },
    },
    orderBy: {
      response: { submittedAt: "desc" },
    },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });

  return {
    questionId: question.id,
    questionText: question.text,
    questionType: "FREE_TEXT",
    position: question.position,
    totalResponses,
    responses: answers.map((a) => ({
      value: a.value,
      submittedAt: a.response.submittedAt ?? new Date(),
    })),
    page: clampedPage,
    totalPages,
  };
}

async function aggregateAllQuestions(
  db: PrismaClient,
  surveyId: string,
  options: { hideFreeText?: boolean },
): Promise<QuestionAggregation[]> {
  const questions = await db.question.findMany({
    where: { surveyId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      text: true,
      questionType: true,
      position: true,
      options: true,
      minRating: true,
      maxRating: true,
    },
  });

  const results: QuestionAggregation[] = [];

  for (const q of questions) {
    if (q.questionType === "SINGLE_SELECT" || q.questionType === "MULTIPLE_CHOICE") {
      results.push(
        await aggregateSelectQuestion(
          db,
          { ...q, questionType: q.questionType },
          surveyId,
        ),
      );
    } else if (q.questionType === "RATING") {
      results.push(await aggregateRatingQuestion(db, q, surveyId));
    } else if (q.questionType === "FREE_TEXT") {
      if (options.hideFreeText) {
        // For private survey + PUBLIC results: show count only, no individual responses
        const totalResponses = await db.answer.count({
          where: {
            questionId: q.id,
            response: {
              surveyId,
              status: "SUBMITTED",
              deletedAt: null,
            },
          },
        });
        results.push({
          questionId: q.id,
          questionText: q.text,
          questionType: "FREE_TEXT",
          position: q.position,
          totalResponses,
          responses: [],
          page: 1,
          totalPages: 0,
        });
      } else {
        results.push(
          await aggregateFreeTextQuestion(db, q, surveyId, 1, 10),
        );
      }
    }
  }

  return results;
}

// ------------------------------------------------------------------
// Router
// ------------------------------------------------------------------

export const resultsRouter = createTRPCRouter({
  getBySurvey: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { slug: input.slug },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          closedAt: true,
          isPrivate: true,
          resultsVisibility: true,
          creatorId: true,
        },
      });

      if (!survey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Survey not found",
        });
      }

      // Results only available when survey is CLOSED (for non-creators)
      if (survey.status !== "CLOSED") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Results are not yet available",
        });
      }

      // Access check by resultsVisibility
      // ctx.userId is null for unauthenticated requests (publicProcedure).
      const userId = ctx.userId;

      if (survey.resultsVisibility === "CREATOR") {
        if (!userId || userId !== survey.creatorId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the survey creator can view these results",
          });
        }
      }

      if (survey.resultsVisibility === "RESPONDENTS") {
        if (!userId) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "You must be signed in to view these results",
          });
        }
        const hasSubmitted = await ctx.db.response.findFirst({
          where: {
            surveyId: survey.id,
            respondentId: userId,
            status: "SUBMITTED",
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!hasSubmitted) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only respondents who submitted a response can view these results",
          });
        }
      }

      // PUBLIC visibility: no auth check needed

      const responseCount = await ctx.db.response.count({
        where: {
          surveyId: survey.id,
          status: "SUBMITTED",
          deletedAt: null,
        },
      });

      // Private survey + PUBLIC results: hide free text individual responses
      const hideFreeText = survey.isPrivate && survey.resultsVisibility === "PUBLIC";

      const questions = await aggregateAllQuestions(ctx.db, survey.id, { hideFreeText });

      return {
        survey: {
          id: survey.id,
          title: survey.title,
          description: survey.description,
          status: survey.status,
          closedAt: survey.closedAt,
          resultsVisibility: survey.resultsVisibility,
        },
        responseCount,
        questions,
      };
    }),

  getForCreator: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.userId;

      const survey = await ctx.db.survey.findUnique({
        where: { slug: input.slug },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          closedAt: true,
          publishedAt: true,
          isPrivate: true,
          resultsVisibility: true,
          creatorId: true,
        },
      });

      if (!survey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Survey not found",
        });
      }

      if (survey.creatorId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the survey creator can access this",
        });
      }

      // Creator can view results while PUBLISHED or CLOSED
      if (survey.status === "DRAFT") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Results are not available for draft surveys",
        });
      }

      const responseCount = await ctx.db.response.count({
        where: {
          surveyId: survey.id,
          status: "SUBMITTED",
          deletedAt: null,
        },
      });

      // Creator always sees full results, including free text
      const questions = await aggregateAllQuestions(ctx.db, survey.id, { hideFreeText: false });

      return {
        survey: {
          id: survey.id,
          title: survey.title,
          description: survey.description,
          status: survey.status,
          closedAt: survey.closedAt,
          publishedAt: survey.publishedAt,
          resultsVisibility: survey.resultsVisibility,
        },
        responseCount,
        questions,
      };
    }),

  getQuestionAggregation: publicProcedure
    .input(
      z.object({
        slug: z.string(),
        questionId: z.string(),
        page: z.number().int().min(1).default(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { slug: input.slug },
        select: {
          id: true,
          status: true,
          isPrivate: true,
          resultsVisibility: true,
          creatorId: true,
        },
      });

      if (!survey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Survey not found",
        });
      }

      // Same access control as getBySurvey
      const userId = ctx.userId;
      const isCreator = userId === survey.creatorId;

      if (!isCreator && survey.status !== "CLOSED") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Results are not yet available",
        });
      }

      if (survey.resultsVisibility === "CREATOR") {
        if (!userId || userId !== survey.creatorId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the survey creator can view these results",
          });
        }
      }

      if (survey.resultsVisibility === "RESPONDENTS") {
        if (!userId) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "You must be signed in to view these results",
          });
        }
        if (!isCreator) {
          const hasSubmitted = await ctx.db.response.findFirst({
            where: {
              surveyId: survey.id,
              respondentId: userId,
              status: "SUBMITTED",
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!hasSubmitted) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Only respondents who submitted a response can view these results",
            });
          }
        }
      }

      const question = await ctx.db.question.findFirst({
        where: {
          id: input.questionId,
          surveyId: survey.id,
        },
        select: {
          id: true,
          text: true,
          questionType: true,
          position: true,
          options: true,
          minRating: true,
          maxRating: true,
        },
      });

      if (!question) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Question not found",
        });
      }

      const hideFreeText =
        survey.isPrivate &&
        survey.resultsVisibility === "PUBLIC" &&
        !isCreator;

      if (question.questionType === "SINGLE_SELECT" || question.questionType === "MULTIPLE_CHOICE") {
        return aggregateSelectQuestion(
          ctx.db,
          { ...question, questionType: question.questionType },
          survey.id,
        );
      }

      if (question.questionType === "RATING") {
        return aggregateRatingQuestion(ctx.db, question, survey.id);
      }

      // FREE_TEXT
      if (hideFreeText) {
        const totalResponses = await ctx.db.answer.count({
          where: {
            questionId: question.id,
            response: {
              surveyId: survey.id,
              status: "SUBMITTED",
              deletedAt: null,
            },
          },
        });
        return {
          questionId: question.id,
          questionText: question.text,
          questionType: "FREE_TEXT" as const,
          position: question.position,
          totalResponses,
          responses: [],
          page: 1,
          totalPages: 0,
        };
      }

      return aggregateFreeTextQuestion(
        ctx.db,
        question,
        survey.id,
        input.page,
        10,
      );
    }),
});
