import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  getSurveyProofData,
  getResponseProofData,
  getResponseCountSummary,
  getCachedResponseIntegrity,
} from "~/server/lib/verification";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const verificationRouter = createTRPCRouter({
  /**
   * getStatus — public query returning high-level verification status for a survey.
   */
  getStatus: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { slug: input.slug },
        select: {
          id: true,
          status: true,
          contentHash: true,
          ipfsCid: true,
          verificationStatus: true,
        },
      });

      if (!survey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }

      // Survey has no on-chain data yet
      if (
        survey.verificationStatus === "NONE" ||
        survey.verificationStatus === "PENDING"
      ) {
        return {
          status: "not_published" as const,
          surveyHash: survey.contentHash,
          ipfsCid: survey.ipfsCid,
          verificationStatus: survey.verificationStatus,
          proofData: null,
        };
      }

      const proofData = await getSurveyProofData(survey.id, ctx.db);

      return {
        status: "published" as const,
        surveyHash: survey.contentHash,
        ipfsCid: survey.ipfsCid,
        verificationStatus: survey.verificationStatus,
        proofData,
      };
    }),

  /**
   * getSurveyProof — public query returning detailed survey proof data.
   */
  getSurveyProof: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { slug: input.slug },
        select: { id: true, status: true, verificationStatus: true },
      });

      if (!survey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }

      const [proofData, responseCountSummary, integrityResult] =
        await Promise.all([
          getSurveyProofData(survey.id, ctx.db),
          getResponseCountSummary(survey.id, ctx.db),
          getCachedResponseIntegrity(survey.id, ctx.db),
        ]);

      return {
        proofData,
        responseCountSummary,
        integrityResult,
      };
    }),

  /**
   * getResponseProof — protected query returning the caller's response proof data.
   */
  getResponseProof: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const survey = await ctx.db.survey.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });

      if (!survey) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
      }

      // Find the caller's response to this survey
      const response = await ctx.db.response.findUnique({
        where: {
          surveyId_respondentId: {
            surveyId: survey.id,
            respondentId: ctx.userId,
          },
        },
        select: { id: true },
      });

      if (!response) {
        return null;
      }

      return getResponseProofData(response.id, ctx.db);
    }),
});
