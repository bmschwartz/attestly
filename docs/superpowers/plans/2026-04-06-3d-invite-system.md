# Sub-Plan 3d: Invite System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement invite management for invite-only surveys — CRUD operations, access checks, email notifications via Resend, and an InviteManagementPanel UI component.

**Architecture:** A dedicated `inviteRouter` handles all invite-related tRPC procedures. Creator-ownership is verified by joining through the survey. EMAIL invites trigger immediate invitation emails via the Resend SDK. The `invite.check` procedure is used by the respondent flow to gate access to invite-only surveys. Email templates are simple React-based Resend templates. The InviteManagementPanel is a client component opened from the creator dashboard for INVITE_ONLY surveys.

**Tech Stack:** Next.js 16, tRPC v11, Prisma 7, Resend, Zod v4, Tailwind CSS 4, React 19

**Spec reference:** `docs/superpowers/specs/2026-04-05-creator-dashboard-design.md`, `docs/superpowers/specs/2026-04-05-respondent-experience-design.md`

---

## File Structure

- Modify: `package.json` — add resend dependency
- Modify: `src/env.js` — add RESEND_API_KEY server-side validation
- Create: `src/server/email/resend.ts` — Resend client singleton
- Create: `src/server/email/templates/invitation.ts` — invitation email template
- Create: `src/server/email/templates/survey-closed.ts` — close notification email template
- Create: `src/server/api/routers/invite.ts` — invite tRPC router
- Modify: `src/server/api/root.ts` — register invite router
- Create: `src/app/dashboard/_components/invite-management-panel.tsx` — invite management UI

---

### Task 1: Install Resend and add env validation

**Files:**
- Modify: `package.json`
- Modify: `src/env.js`

- [ ] **Step 1: Install Resend**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm add resend
```

- [ ] **Step 2: Add RESEND_API_KEY to env validation**

In `src/env.js`, add `RESEND_API_KEY` to the server schema and runtimeEnv. The full updated `server` object inside `createEnv`:

```js
  server: {
    PRIVY_APP_SECRET: z.string().min(1),
    DATABASE_URL: z.string().url(),
    RESEND_API_KEY: z.string().min(1),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  client: {
    NEXT_PUBLIC_PRIVY_APP_ID: z.string().min(1),
  },
```

And in the `runtimeEnv` object, add:

```js
    RESEND_API_KEY: process.env.RESEND_API_KEY,
```

- [ ] **Step 3: Add RESEND_API_KEY to .env.example (if it exists) or .env**

```bash
cd /Users/bmschwartz/Development/attestly && echo "RESEND_API_KEY=re_placeholder" >> .env.example 2>/dev/null; echo "RESEND_API_KEY=re_placeholder" >> .env 2>/dev/null
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add package.json pnpm-lock.yaml src/env.js .env.example
git commit -m "feat: install resend and add RESEND_API_KEY env validation"
```

---

### Task 2: Create Resend client and email templates

**Files:**
- Create: `src/server/email/resend.ts`
- Create: `src/server/email/templates/invitation.ts`
- Create: `src/server/email/templates/survey-closed.ts`

- [ ] **Step 1: Create the email directory**

```bash
mkdir -p /Users/bmschwartz/Development/attestly/src/server/email/templates
```

- [ ] **Step 2: Create the Resend client singleton**

Create `src/server/email/resend.ts`:

```typescript
import { Resend } from "resend";
import { env } from "~/env";

export const resend = new Resend(env.RESEND_API_KEY);

/** Default sender address — update to your verified domain */
export const FROM_EMAIL = "Attestly <noreply@attestly.com>";
```

- [ ] **Step 3: Create the invitation email template**

Create `src/server/email/templates/invitation.ts`:

```typescript
import { resend, FROM_EMAIL } from "../resend";

interface SendInvitationEmailParams {
  to: string;
  surveyTitle: string;
  surveyDescription: string;
  surveyUrl: string;
}

/**
 * Send an invitation email when a creator adds an EMAIL invite.
 * Subject: "You're invited: {title}"
 */
export async function sendInvitationEmail({
  to,
  surveyTitle,
  surveyDescription,
  surveyUrl,
}: SendInvitationEmailParams) {
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `You're invited: ${surveyTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #111827; font-size: 24px; margin-bottom: 16px;">
          You've been invited to a survey
        </h1>
        <h2 style="color: #374151; font-size: 20px; margin-bottom: 8px;">
          ${escapeHtml(surveyTitle)}
        </h2>
        ${surveyDescription ? `<p style="color: #6b7280; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">${escapeHtml(surveyDescription)}</p>` : ""}
        <a
          href="${surveyUrl}"
          style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;"
        >
          Take the Survey
        </a>
        <p style="color: #9ca3af; font-size: 14px; margin-top: 32px;">
          This invitation was sent via Attestly. If you didn't expect this email, you can safely ignore it.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error(`Failed to send invitation email to ${to}:`, error);
    throw error;
  }
}

/** Escape HTML special characters to prevent injection */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

- [ ] **Step 4: Create the survey closed email template**

Create `src/server/email/templates/survey-closed.ts`:

```typescript
import { resend, FROM_EMAIL } from "../resend";

interface SendSurveyClosedEmailParams {
  to: string;
  surveyTitle: string;
  resultsUrl: string;
}

/**
 * Send a notification email when a survey closes.
 * Subject: "Results are in: {title}"
 */
export async function sendSurveyClosedEmail({
  to,
  surveyTitle,
  resultsUrl,
}: SendSurveyClosedEmailParams) {
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Results are in: ${surveyTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #111827; font-size: 24px; margin-bottom: 16px;">
          Survey results are ready
        </h1>
        <h2 style="color: #374151; font-size: 20px; margin-bottom: 8px;">
          ${escapeHtml(surveyTitle)}
        </h2>
        <p style="color: #6b7280; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
          The survey has been closed and the results are now available for viewing.
        </p>
        <a
          href="${resultsUrl}"
          style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;"
        >
          View Results
        </a>
        <p style="color: #9ca3af; font-size: 14px; margin-top: 32px;">
          This notification was sent via Attestly because you participated in this survey.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error(`Failed to send survey closed email to ${to}:`, error);
    throw error;
  }
}

/** Escape HTML special characters to prevent injection */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && SKIP_ENV_VALIDATION=1 pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/email/
git commit -m "feat: add Resend client and email templates for invitations and survey close"
```

---

### Task 3: Create invite router with invite.list procedure

**Files:**
- Create: `src/server/api/routers/invite.ts`

- [ ] **Step 1: Create the routers directory if needed**

```bash
mkdir -p /Users/bmschwartz/Development/attestly/src/server/api/routers
```

- [ ] **Step 2: Create the invite router with invite.list**

Create `src/server/api/routers/invite.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

/**
 * Helper: verify the authenticated user is the creator of the given survey.
 * Returns the survey if found and owned, throws otherwise.
 */
async function verifyCreatorOwnership(
  db: Parameters<Parameters<typeof protectedProcedure.query>[0]>["ctx"]["db"],
  surveyId: string,
  userId: string,
) {
  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: { id: true, creatorId: true, title: true, description: true, slug: true, accessMode: true },
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
});
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && SKIP_ENV_VALIDATION=1 pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/api/routers/invite.ts
git commit -m "feat: add invite router with invite.list procedure"
```

---

### Task 4: Add invite.add procedure (with email sending)

**Files:**
- Modify: `src/server/api/routers/invite.ts`

- [ ] **Step 1: Add the import for the invitation email template**

Add at the top of `src/server/api/routers/invite.ts`, after the existing imports:

```typescript
import { sendInvitationEmail } from "~/server/email/templates/invitation";
```

- [ ] **Step 2: Add the invite.add procedure**

Add inside the `createTRPCRouter({})` call in `src/server/api/routers/invite.ts`, after the `list` procedure:

```typescript
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
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://attestly.com";
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
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && SKIP_ENV_VALIDATION=1 pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/api/routers/invite.ts
git commit -m "feat: add invite.add procedure with bulk entry and Resend email sending"
```

---

### Task 5: Add invite.remove procedure

**Files:**
- Modify: `src/server/api/routers/invite.ts`

- [ ] **Step 1: Add the invite.remove procedure**

Add inside the `createTRPCRouter({})` call in `src/server/api/routers/invite.ts`, after the `add` procedure:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && SKIP_ENV_VALIDATION=1 pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/api/routers/invite.ts
git commit -m "feat: add invite.remove procedure"
```

---

### Task 6: Add invite.check procedure

**Files:**
- Modify: `src/server/api/routers/invite.ts`

- [ ] **Step 1: Add the invite.check procedure**

Add inside the `createTRPCRouter({})` call in `src/server/api/routers/invite.ts`, after the `remove` procedure:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && SKIP_ENV_VALIDATION=1 pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/api/routers/invite.ts
git commit -m "feat: add invite.check procedure for access verification"
```

---

### Task 7: Add invite.getProgress procedure

**Files:**
- Modify: `src/server/api/routers/invite.ts`

- [ ] **Step 1: Add the invite.getProgress procedure**

Add inside the `createTRPCRouter({})` call in `src/server/api/routers/invite.ts`, after the `check` procedure:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && SKIP_ENV_VALIDATION=1 pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/api/routers/invite.ts
git commit -m "feat: add invite.getProgress procedure"
```

---

### Task 8: Register invite router in root.ts

**Files:**
- Modify: `src/server/api/root.ts`

- [ ] **Step 1: Add invite router import and registration**

Add the import at the top of `src/server/api/root.ts`:

```typescript
import { inviteRouter } from "~/server/api/routers/invite";
```

Add `invite: inviteRouter,` inside the `createTRPCRouter({})` call in `src/server/api/root.ts`. The router object should include:

```typescript
export const appRouter = createTRPCRouter({
  // ... existing routers ...
  invite: inviteRouter,
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && SKIP_ENV_VALIDATION=1 pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/server/api/root.ts
git commit -m "feat: register invite router in root.ts"
```

---

### Task 9: Create InviteManagementPanel component

**Files:**
- Create: `src/app/dashboard/_components/invite-management-panel.tsx`

- [ ] **Step 1: Create the components directory if needed**

```bash
mkdir -p /Users/bmschwartz/Development/attestly/src/app/dashboard/_components
```

- [ ] **Step 2: Create the InviteManagementPanel component**

Create `src/app/dashboard/_components/invite-management-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

interface InviteManagementPanelProps {
  surveyId: string;
  onClose: () => void;
}

export function InviteManagementPanel({
  surveyId,
  onClose,
}: InviteManagementPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const utils = api.useUtils();

  const { data: invites, isLoading: invitesLoading } =
    api.invite.list.useQuery({ surveyId });

  const { data: progress } = api.invite.getProgress.useQuery({ surveyId });

  const addMutation = api.invite.add.useMutation({
    onSuccess: () => {
      setInputValue("");
      setError(null);
      void utils.invite.list.invalidate({ surveyId });
      void utils.invite.getProgress.invalidate({ surveyId });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const removeMutation = api.invite.remove.useMutation({
    onSuccess: () => {
      void utils.invite.list.invalidate({ surveyId });
      void utils.invite.getProgress.invalidate({ surveyId });
    },
  });

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setError(null);
    addMutation.mutate({ surveyId, value: trimmed });
  };

  const handleRemove = (inviteId: string, type: string) => {
    if (type === "DOMAIN") {
      const confirmed = window.confirm(
        "Remove this domain invite? This may affect many users.",
      );
      if (!confirmed) return;
    }
    removeMutation.mutate({ inviteId });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  // Detect input type for hint text
  const trimmedInput = inputValue.trim();
  const inputHint = trimmedInput
    ? trimmedInput.includes("@")
      ? "Email invite"
      : "Domain invite"
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Manage Invites
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Progress indicator */}
        {progress && progress.total > 0 && (
          <div className="border-b border-gray-200 bg-blue-50 px-6 py-3">
            <p className="text-sm text-blue-700">
              {progress.responded} of {progress.total} invited have responded
            </p>
          </div>
        )}

        {/* Add invite input */}
        <div className="px-6 py-4">
          <label
            htmlFor="invite-input"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Add emails or domain
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                id="invite-input"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="user@example.com or example.com (comma-separated)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={addMutation.isPending}
              />
              {inputHint && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  {inputHint}
                </span>
              )}
            </div>
            <button
              onClick={handleAdd}
              disabled={!trimmedInput || addMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addMutation.isPending ? "Adding..." : "Add"}
            </button>
          </div>
          {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        </div>

        {/* Invite list */}
        <div className="max-h-64 overflow-y-auto border-t border-gray-200 px-6 py-2">
          {invitesLoading ? (
            <div className="py-4 text-center text-sm text-gray-400">
              Loading invites...
            </div>
          ) : !invites || invites.length === 0 ? (
            <div className="py-4 text-center text-sm text-gray-400">
              No invites yet. Add email addresses or domains above.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-2">
                    {/* Type icon */}
                    {invite.type === "EMAIL" ? (
                      <svg
                        className="h-4 w-4 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        aria-label="Email invite"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="h-4 w-4 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        aria-label="Domain invite"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
                        />
                      </svg>
                    )}
                    <span className="text-sm text-gray-700">
                      {invite.value}
                    </span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                      {invite.type === "EMAIL" ? "Email" : "Domain"}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemove(invite.id, invite.type)}
                    disabled={removeMutation.isPending}
                    className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
                    aria-label={`Remove ${invite.value}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-gray-200 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/bmschwartz/Development/attestly && SKIP_ENV_VALIDATION=1 pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
cd /Users/bmschwartz/Development/attestly
git add src/app/dashboard/_components/invite-management-panel.tsx
git commit -m "feat: add InviteManagementPanel component with invite CRUD and progress"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full typecheck**

```bash
cd /Users/bmschwartz/Development/attestly && SKIP_ENV_VALIDATION=1 pnpm typecheck
```

- [ ] **Step 2: Run lint**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm lint
```

- [ ] **Step 3: Run tests if available**

```bash
cd /Users/bmschwartz/Development/attestly && pnpm test 2>/dev/null || echo "No test runner configured"
```

- [ ] **Step 4: Final commit (if lint fixes needed)**

```bash
cd /Users/bmschwartz/Development/attestly
git add -A
git status
# Only commit if there are changes from lint fixes
git diff --cached --quiet || git commit -m "chore: lint fixes for invite system"
```
