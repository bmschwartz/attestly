import { randomBytes } from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function randomSuffix(): string {
  return randomBytes(4).toString("hex"); // 8 hex chars = 4 billion combinations
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const surveyRouter = createTRPCRouter({
  /**
   * 1. create — create a new DRAFT survey.
   */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const baseTitle = input.title?.trim() ?? "Untitled Survey";

      let survey;
      for (let attempt = 0; attempt < 3; attempt++) {
        const slug = `${slugify(baseTitle)}-${randomSuffix()}`;
        try {
          survey = await ctx.db.survey.create({
            data: {
              title: baseTitle,
              description: "",
              slug,
              status: "DRAFT",
              creator: { connect: { id: ctx.userId } },
            },
          });
          break;
        } catch (e: unknown) {
          const prismaErr = e as { code?: string };
          if (prismaErr?.code === "P2002" && attempt < 2) continue; // Unique constraint, retry
          throw e;
        }
      }
      if (!survey) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not generate unique slug",
        });
      }

      return survey;
    }),

  /**
   * 2. update — update fields on a DRAFT survey.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        slug: z.string().optional(),
        isPrivate: z.boolean().optional(),
        accessMode: z.enum(["OPEN", "INVITE_ONLY"]).optional(),
        resultsVisibility: z
          .enum(["PUBLIC", "RESPONDENTS", "CREATOR"])
          .optional(),
        categories: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { id: input.id },
        select: { id: true, creatorId: true, status: true },
      });

      if (!survey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }
      if (survey.creatorId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not the survey owner",
        });
      }
      if (survey.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only DRAFT surveys can be updated",
        });
      }

      const tags = input.tags?.map((t) => t.toLowerCase().trim());

      const updated = await ctx.db.survey.update({
        where: { id: input.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.isPrivate !== undefined
            ? { isPrivate: input.isPrivate }
            : {}),
          ...(input.accessMode !== undefined
            ? { accessMode: input.accessMode }
            : {}),
          ...(input.resultsVisibility !== undefined
            ? { resultsVisibility: input.resultsVisibility }
            : {}),
          ...(input.categories !== undefined
            ? { categories: input.categories }
            : {}),
          ...(tags !== undefined ? { tags } : {}),
        },
      });

      return updated;
    }),

  /**
   * 3. getForEdit — fetch a survey (with ordered questions) for the owner to edit.
   */
  getForEdit: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { id: input.id },
        include: {
          questions: {
            orderBy: { position: "asc" },
          },
        },
      });

      if (!survey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }
      if (survey.creatorId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not the survey owner",
        });
      }

      return survey;
    }),

  /**
   * 4. getBySlug — public read of a published survey by slug.
   */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { slug: input.slug },
        include: {
          questions: {
            orderBy: { position: "asc" },
          },
          creator: {
            select: {
              id: true,
              displayName: true,
              avatar: true,
              walletAddress: true,
            },
          },
          _count: {
            select: { responses: true },
          },
        },
      });

      if (!survey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }
      if (survey.status === "DRAFT") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }

      // Note: getBySlug intentionally returns all survey data for non-DRAFT surveys,
      // including private and invite-only surveys. The landing page must be visible
      // so users can see what the survey is about before authenticating.
      // Access control for responding is enforced in response.start.
      // Response data privacy (encryption) is a separate concern handled in Phase 3.
      return survey;
    }),

  /**
   * 5. publish — validate and transition a DRAFT survey to PUBLISHED.
   */
  publish: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const survey = await tx.survey.findUnique({
          where: { id: input.id },
          include: { questions: { orderBy: { position: "asc" } } },
        });

        if (!survey) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
        }
        if (survey.creatorId !== ctx.userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Not the survey owner",
          });
        }
        if (survey.status !== "DRAFT") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only DRAFT surveys can be published",
          });
        }

        // --- Validate title ---
        if (!survey.title || survey.title.trim().length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Title is required",
          });
        }
        if (survey.title.length > 200) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Title must be 200 characters or fewer",
          });
        }

        // --- Validate description ---
        if (!survey.description || survey.description.trim().length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Description is required",
          });
        }
        if (survey.description.length > 2000) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Description must be 2000 characters or fewer",
          });
        }

        // --- Validate questions count ---
        const questions = survey.questions;
        if (questions.length < 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Survey must have at least 1 question",
          });
        }
        if (questions.length > 100) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Survey can have at most 100 questions",
          });
        }

        // --- Validate categories ---
        const categories = Array.isArray(survey.categories)
          ? (survey.categories as string[])
          : [];
        if (categories.length < 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Survey must have at least 1 category",
          });
        }
        if (categories.length > 5) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Survey can have at most 5 categories",
          });
        }

        // --- Validate tags ---
        const tags = Array.isArray(survey.tags) ? (survey.tags as string[]) : [];
        if (tags.length > 10) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Survey can have at most 10 tags",
          });
        }

        // --- Validate slug uniqueness ---
        const existingWithSlug = await tx.survey.findFirst({
          where: { slug: survey.slug, id: { not: survey.id } },
          select: { id: true },
        });
        if (existingWithSlug) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Slug is already taken",
          });
        }

        // --- Per-question validations ---
        const SELECT_TYPES = ["SINGLE_SELECT", "MULTIPLE_CHOICE"];
        for (const q of questions) {
          if (!q.text || q.text.trim().length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Question ${q.position} text is required`,
            });
          }

          if (SELECT_TYPES.includes(q.questionType)) {
            const options = Array.isArray(q.options)
              ? (q.options as string[])
              : [];
            if (options.length < 2) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Question ${q.position} must have at least 2 options`,
              });
            }
            // No duplicate options
            const unique = new Set(options.map((o) => o.trim()));
            if (unique.size !== options.length) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Question ${q.position} has duplicate options`,
              });
            }
            // No empty options
            for (const opt of options) {
              if (!opt || opt.trim().length === 0) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: `Question ${q.position} has an empty option`,
                });
              }
            }
          }

          if (q.questionType === "RATING") {
            if (q.minRating === null || q.maxRating === null) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Question ${q.position} rating must have min and max`,
              });
            }
            if (q.minRating >= q.maxRating) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Question ${q.position} rating min must be less than max`,
              });
            }
          }

          if (q.questionType === "FREE_TEXT") {
            if (q.maxLength === null || q.maxLength === undefined) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Question ${q.position} free text must have a maxLength`,
              });
            }
            if (q.maxLength <= 0) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Question ${q.position} free text maxLength must be greater than 0`,
              });
            }
          }
        }

        // --- Transition to PUBLISHED ---
        const published = await tx.survey.update({
          where: { id: input.id },
          data: {
            status: "PUBLISHED",
            publishedAt: new Date(),
          },
        });

        return published;
      });
    }),

  /**
   * 6. deleteDraft — hard delete a DRAFT survey.
   */
  deleteDraft: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { id: input.id },
        select: { id: true, creatorId: true, status: true },
      });

      if (!survey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }
      if (survey.creatorId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not the survey owner",
        });
      }
      if (survey.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only DRAFT surveys can be deleted this way",
        });
      }

      await ctx.db.survey.delete({ where: { id: input.id } });

      return { success: true };
    }),

  /**
   * 7. listMine — cursor-paginated list of the caller's surveys.
   */
  listMine: protectedProcedure
    .input(
      z.object({
        status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).optional(),
        limit: z.number().int().min(1).max(100).optional().default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 20;

      const surveys = await ctx.db.survey.findMany({
        where: {
          creatorId: ctx.userId,
          ...(input.status ? { status: input.status } : {}),
        },
        take: limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { responses: true, questions: true },
          },
        },
      });

      let nextCursor: string | undefined;
      if (surveys.length > limit) {
        const next = surveys.pop();
        nextCursor = next?.id;
      }

      return { surveys, nextCursor };
    }),

  /**
   * 8. getStats — aggregate counts for the authenticated user.
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const [totalSurveys, activeSurveys, totalResponses] = await Promise.all([
      ctx.db.survey.count({ where: { creatorId: ctx.userId } }),
      ctx.db.survey.count({
        where: { creatorId: ctx.userId, status: "PUBLISHED" },
      }),
      ctx.db.response.count({
        where: {
          survey: { creatorId: ctx.userId },
          status: "SUBMITTED",
        },
      }),
    ]);

    return { totalSurveys, totalResponses, activeSurveys };
  }),

  /**
   * 9. close — transition a PUBLISHED survey to CLOSED, soft-delete IN_PROGRESS responses.
   */
  close: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { id: input.id },
        select: { id: true, creatorId: true, status: true },
      });

      if (!survey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }
      if (survey.creatorId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not the survey owner",
        });
      }
      if (survey.status !== "PUBLISHED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only PUBLISHED surveys can be closed",
        });
      }

      const closed = await ctx.db.$transaction(async (tx) => {
        // Soft-delete IN_PROGRESS responses
        await tx.response.updateMany({
          where: { surveyId: input.id, status: "IN_PROGRESS" },
          data: { deletedAt: new Date() },
        });

        // Close the survey
        return tx.survey.update({
          where: { id: input.id },
          data: { status: "CLOSED", closedAt: new Date() },
        });
      });

      // Queue AI summary generation if creator is premium
      const subscription = await ctx.db.subscription.findUnique({
        where: { userId: ctx.userId },
      });
      if (subscription && subscription.plan !== "FREE" && subscription.status === "ACTIVE") {
        await ctx.db.backgroundJob.create({
          data: {
            type: "GENERATE_AI_SUMMARY",
            surveyId: input.id,
            payload: { surveyId: input.id },
          },
        });
      }

      return closed;
    }),
});
