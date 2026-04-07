import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { sendInvitationEmail } from "~/server/email/templates/invitation";
import { type db as dbType } from "~/server/db";

/**
 * Helper: verify the authenticated user is the creator of the given survey.
 * Returns the survey if found and owned, throws otherwise.
 */
async function verifyCreatorOwnership(
  db: typeof dbType,
  surveyId: string,
  userId: string,
) {
  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      creatorId: true,
      title: true,
      description: true,
      slug: true,
      accessMode: true,
    },
  });

  if (!survey) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });
  }

  if (survey.creatorId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not your survey" });
  }

  return survey;
}

export const inviteRouter = createTRPCRouter({
  /**
   * List all invites for a survey. Creator only.
   */
  list: protectedProcedure
    .input(z.object({ surveyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyCreatorOwnership(ctx.db, input.surveyId, ctx.userId);

      const invites = await ctx.db.surveyInvite.findMany({
        where: { surveyId: input.surveyId },
        orderBy: { invitedAt: "desc" },
        select: {
          id: true,
          type: true,
          value: true,
          invitedAt: true,
        },
      });

      return invites;
    }),

  /**
   * Add one or more invites to a survey. Creator only.
   * Auto-detects type: contains @ = EMAIL, no @ = DOMAIN.
   * Supports comma-separated bulk entry for emails.
   * EMAIL invites immediately trigger an invitation email via Resend.
   */
  add: protectedProcedure
    .input(
      z.object({
        surveyId: z.string().uuid(),
        value: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const survey = await verifyCreatorOwnership(
        ctx.db,
        input.surveyId,
        ctx.userId,
      );

      if (survey.accessMode !== "INVITE_ONLY") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Survey is not invite-only",
        });
      }

      // Parse comma-separated values, trim whitespace, remove empties
      const rawValues = input.value
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);

      if (rawValues.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No valid values provided",
        });
      }

      // Auto-detect type and deduplicate
      const entries = rawValues.map((v) => ({
        type: v.includes("@") ? ("EMAIL" as const) : ("DOMAIN" as const),
        value: v,
      }));

      // Validate email format for EMAIL types
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const entry of entries) {
        if (entry.type === "EMAIL" && !emailRegex.test(entry.value)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid email address: ${entry.value}`,
          });
        }
      }

      // Fetch existing invites to avoid duplicates
      const existing = await ctx.db.surveyInvite.findMany({
        where: { surveyId: input.surveyId },
        select: { type: true, value: true },
      });

      const existingSet = new Set(
        existing.map((e) => `${e.type}:${e.value}`),
      );

      const newEntries = entries.filter(
        (e) => !existingSet.has(`${e.type}:${e.value}`),
      );

      if (newEntries.length === 0) {
        return { added: 0 };
      }

      // Create all invites in a single batch
      const now = new Date();
      await ctx.db.surveyInvite.createMany({
        data: newEntries.map((e) => ({
          surveyId: input.surveyId,
          type: e.type,
          value: e.value,
          invitedAt: now,
        })),
      });

      // Send invitation emails for EMAIL invites (fire-and-forget, don't block)
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://attest.ly";
      const surveyUrl = `${baseUrl}/s/${survey.slug}`;

      const emailEntries = newEntries.filter((e) => e.type === "EMAIL");
      if (emailEntries.length > 0) {
        // Send emails in parallel but don't block the response
        void Promise.allSettled(
          emailEntries.map((e) =>
            sendInvitationEmail({
              to: e.value,
              surveyTitle: survey.title,
              surveyDescription: survey.description ?? "",
              surveyUrl,
            }),
          ),
        ).then((results) => {
          const failed = results.filter((r) => r.status === "rejected");
          if (failed.length > 0) {
            console.error(
              `Failed to send ${failed.length} invitation email(s) for survey ${input.surveyId}`,
            );
          }
        });
      }

      return { added: newEntries.length };
    }),

  /**
   * Remove an invite from a survey. Creator only.
   */
  remove: protectedProcedure
    .input(
      z.object({
        inviteId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const invite = await ctx.db.surveyInvite.findUnique({
        where: { id: input.inviteId },
        select: {
          id: true,
          surveyId: true,
          survey: {
            select: { creatorId: true },
          },
        },
      });

      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      }

      if (invite.survey.creatorId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your survey" });
      }

      await ctx.db.surveyInvite.delete({
        where: { id: input.inviteId },
      });

      return { success: true };
    }),

  /**
   * Check if the authenticated user's email matches any invite for a survey.
   * Returns { invited: true/false }.
   * Checks EMAIL exact match and DOMAIN match on email domain.
   */
  check: protectedProcedure
    .input(z.object({ surveyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Get the user's email
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { email: true },
      });

      if (!user?.email) {
        return { invited: false, reason: "No email on file" };
      }

      const email = user.email.toLowerCase();
      const domain = email.split("@")[1];

      // Check for exact email match
      const emailInvite = await ctx.db.surveyInvite.findFirst({
        where: {
          surveyId: input.surveyId,
          type: "EMAIL",
          value: email,
        },
      });

      if (emailInvite) {
        return { invited: true };
      }

      // Check for domain match
      if (domain) {
        const domainInvite = await ctx.db.surveyInvite.findFirst({
          where: {
            surveyId: input.surveyId,
            type: "DOMAIN",
            value: domain,
          },
        });

        if (domainInvite) {
          return { invited: true };
        }
      }

      return { invited: false };
    }),

  /**
   * Get invite response progress for a survey. Creator only.
   * Returns count of EMAIL invitees who have submitted a response.
   */
  getProgress: protectedProcedure
    .input(z.object({ surveyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await verifyCreatorOwnership(ctx.db, input.surveyId, ctx.userId);

      // Count total EMAIL invites
      const totalEmailInvites = await ctx.db.surveyInvite.count({
        where: {
          surveyId: input.surveyId,
          type: "EMAIL",
        },
      });

      // Get all EMAIL invite values (email addresses)
      const emailInvites = await ctx.db.surveyInvite.findMany({
        where: {
          surveyId: input.surveyId,
          type: "EMAIL",
        },
        select: { value: true },
      });

      if (emailInvites.length === 0) {
        return { total: 0, responded: 0 };
      }

      const invitedEmails = emailInvites.map((i) => i.value);

      // Count how many of those invited emails have submitted responses
      const responded = await ctx.db.response.count({
        where: {
          surveyId: input.surveyId,
          status: "SUBMITTED",
          deletedAt: null,
          respondent: {
            email: { in: invitedEmails },
          },
        },
      });

      return { total: totalEmailInvites, responded };
    }),
});
