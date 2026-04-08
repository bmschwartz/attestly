# Premium Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement premium feature gating throughout the application — subscription checks, upsell components, free tier limits, and downgrade behavior.

**Architecture:** Centralized premium utility functions + a React hook for client-side checks + a PremiumGate wrapper component. Server-side checks in tRPC procedures. Admin can manually set subscription plans.

**Tech Stack:** tRPC 11, Prisma 7, React 19, Tailwind CSS

**Spec reference:** `docs/superpowers/specs/INDEX.md` (Free vs Premium table, Premium Downgrade Behavior)

---

### Task 1: Create premium utility functions

**Files:**
- Create: `src/lib/premium.ts`

- [ ] **Step 1: Create server-side premium utilities**

```typescript
import type { SubscriptionPlan, SubscriptionStatus } from "~/generated/prisma";

interface SubscriptionInfo {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
}

export function isPremium(subscription: SubscriptionInfo | null): boolean {
  if (!subscription) return false;
  return subscription.plan !== "FREE" && subscription.status === "ACTIVE";
}

export function canCreateSurvey(
  subscription: SubscriptionInfo | null,
  currentSurveyCount: number,
): { allowed: boolean; reason?: string } {
  if (isPremium(subscription)) return { allowed: true };
  if (currentSurveyCount >= 5) {
    return {
      allowed: false,
      reason: "You've reached the free plan limit of 5 surveys. Upgrade for unlimited.",
    };
  }
  return { allowed: true };
}

export function canAcceptResponse(
  creatorSubscription: SubscriptionInfo | null,
  currentResponseCount: number,
): { allowed: boolean; reason?: string } {
  if (isPremium(creatorSubscription)) return { allowed: true };
  if (currentResponseCount >= 50) {
    return {
      allowed: false,
      reason: "This survey has reached its response limit.",
    };
  }
  return { allowed: true };
}

export function canUseFeature(
  subscription: SubscriptionInfo | null,
  feature: "private" | "invite_only" | "results_respondents" | "results_creator" | "ai_insights" | "ai_chat" | "paid_surveys",
): boolean {
  return isPremium(subscription);
}

export const FREE_TIER_LIMITS = {
  maxSurveys: 5,
  maxResponsesPerSurvey: 50,
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/premium.ts
git commit -m "feat: add premium utility functions"
```

---

### Task 2: Create usePremium React hook

**Files:**
- Create: `src/hooks/use-premium.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import { api } from "~/trpc/react";
import { useMemo } from "react";

export function usePremium() {
  const { data: subscription, isLoading } = api.user.getSubscription.useQuery(
    undefined,
    { staleTime: 60_000 }, // Cache for 1 minute
  );

  const isPremium = useMemo(() => {
    if (!subscription) return false;
    return subscription.plan !== "FREE" && subscription.status === "ACTIVE";
  }, [subscription]);

  return {
    isPremium,
    plan: subscription?.plan ?? "FREE",
    status: subscription?.status ?? "ACTIVE",
    isLoading,
  };
}
```

- [ ] **Step 2: Add user.getSubscription procedure**

In `src/server/api/routers/user.ts`, add:

```typescript
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.subscription.findUnique({
      where: { userId: ctx.userId },
      select: { plan: true, status: true, currentPeriodEnd: true },
    });
  }),
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-premium.ts src/server/api/routers/user.ts
git commit -m "feat: add usePremium hook and getSubscription procedure"
```

---

### Task 3: Create PremiumGate component

**Files:**
- Create: `src/app/_components/premium-gate.tsx`

- [ ] **Step 1: Create the gating wrapper**

```typescript
"use client";

import { usePremium } from "~/hooks/use-premium";
import type { ReactNode } from "react";

const UPSELL_MESSAGES: Record<string, { feature: string; message: string }> = {
  private: {
    feature: "Private Surveys",
    message: "Make responses private and control who sees results — available on Premium",
  },
  invite_only: {
    feature: "Invite-Only Access",
    message: "Restrict responses to invited participants — available on Premium",
  },
  results_visibility: {
    feature: "Results Visibility Controls",
    message: "Control who sees your results — available on Premium",
  },
  ai_insights: {
    feature: "AI Insights",
    message: "Get AI-powered summaries and chat with your data — available on Premium",
  },
  ai_chat: {
    feature: "AI Chat",
    message: "Chat with your survey data — available on Premium",
  },
  paid_surveys: {
    feature: "Paid Surveys",
    message: "Incentivize responses with USDC rewards — available on Premium",
  },
};

interface PremiumGateProps {
  feature: keyof typeof UPSELL_MESSAGES;
  children: ReactNode;
  /** Render instead of children when not premium. Defaults to lock + message. */
  fallback?: ReactNode;
}

export function PremiumGate({ feature, children, fallback }: PremiumGateProps) {
  const { isPremium, isLoading } = usePremium();

  if (isLoading) return null;

  if (isPremium) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  const upsell = UPSELL_MESSAGES[feature];
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 opacity-75">
      <span className="text-lg">🔒</span>
      <div>
        <p className="text-sm font-medium text-gray-600">{upsell.feature}</p>
        <p className="text-xs text-gray-400">{upsell.message}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/premium-gate.tsx
git commit -m "feat: add PremiumGate component with contextual upsell messages"
```

---

### Task 4: Apply premium gating to survey builder

**Files:**
- Modify: `src/app/surveys/[id]/edit/page.tsx` (or the SurveyMetadataForm component)

- [ ] **Step 1: Wrap premium fields with PremiumGate**

In the SurveyMetadataForm component, wrap:
- Private toggle with `<PremiumGate feature="private">`
- Invite-only toggle with `<PremiumGate feature="invite_only">`
- Results visibility RESPONDENTS and CREATOR options with `<PremiumGate feature="results_visibility">`

For the dropdown, render the premium options as disabled with the lock icon if not premium.

- [ ] **Step 2: Commit**

```bash
git add src/app/surveys/[id]/edit/
git commit -m "feat: apply premium gating to survey builder metadata"
```

---

### Task 5: Apply free tier survey limit

**Files:**
- Modify: `src/app/dashboard/page.tsx` (or DashboardPage component)
- Modify: `src/server/api/routers/survey.ts` (survey.create)

- [ ] **Step 1: Add server-side check to survey.create**

In the `survey.create` mutation, before creating:

```typescript
const subscription = await ctx.db.subscription.findUnique({
  where: { userId: ctx.userId },
});
const surveyCount = await ctx.db.survey.count({
  where: { creatorId: ctx.userId },
});
const check = canCreateSurvey(
  subscription ? { plan: subscription.plan, status: subscription.status } : null,
  surveyCount,
);
if (!check.allowed) {
  throw new TRPCError({ code: "FORBIDDEN", message: check.reason });
}
```

- [ ] **Step 2: Add client-side check to "New Survey" button**

In the dashboard, use `usePremium` hook + survey count to disable the button with upsell message when limit reached.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/survey.ts src/app/dashboard/
git commit -m "feat: enforce free tier 5-survey limit"
```

---

### Task 6: Apply free tier response limit

**Files:**
- Modify: `src/server/api/routers/response.ts` (response.start — already has the check from 2d)

- [ ] **Step 1: Verify the response.start procedure checks the limit**

The response.start procedure from sub-plan 2d already includes the 50-response check for free tier creators. Verify it uses the `canAcceptResponse` utility function. If not, refactor to use it.

- [ ] **Step 2: Add client-side feedback on the landing page**

In the survey landing page, if the survey has reached its response limit, show "This survey has reached its response limit" instead of the "Start Survey" button.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/response.ts src/app/s/[slug]/
git commit -m "feat: enforce free tier 50-response limit with UI feedback"
```

---

### Task 7: Apply premium gating to AI features

**Files:**
- Modify: Results page (integrate AiSummaryCard or PremiumUpsell)
- Modify: ChatSidebar (already has isPremium prop from 4c)

- [ ] **Step 1: Integrate AI summary display on results page**

On the results page, if premium: show AiSummaryCard for top-level and per-free-text questions.
If not premium: show blurred PremiumUpsell card: "AI found N insights from your N free text responses. Upgrade to read them."

- [ ] **Step 2: Gate cross-survey insights link on dashboard**

In the dashboard navbar or sidebar, show "Cross-Survey Insights" link with a premium badge. On click, if not premium, show upgrade prompt.

- [ ] **Step 3: Commit**

```bash
git add src/app/s/[slug]/results/ src/app/dashboard/
git commit -m "feat: apply premium gating to AI insights and chat"
```

---

### Task 8: Implement downgrade behavior

**Files:**
- Modify: `src/lib/premium.ts`

- [ ] **Step 1: Document and implement downgrade rules**

The downgrade behavior is enforced by the existing gating logic:
- **Grandfathered:** existing private surveys stay private (isPrivate is on the Survey, not checked against current subscription). Existing invites remain (SurveyInvite records persist).
- **Gated:** AI summaries hidden (getSummaries checks subscription), chat disabled (ChatSidebar checks isPremium), verification bundles gated (Phase 3).
- **Revoked for new actions:** canCreateSurvey checks current plan, survey.create enforces limit. New private/invite-only surveys blocked by builder PremiumGate.

No additional code needed — the gating is inherently downgrade-aware because it checks current subscription status, not historical status. Add a comment to `premium.ts`:

```typescript
/**
 * Downgrade behavior:
 * - Grandfathered: existing private surveys stay private, existing invites remain
 * - Gated: AI summaries hidden, chat disabled, verification bundles gated
 * - Revoked: can't create new private/invite-only surveys, limits re-apply
 * This works because all gates check CURRENT subscription, not historical.
 */
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/premium.ts
git commit -m "feat: document downgrade behavior in premium utilities"
```

---

### Task 9: Add admin subscription management

**Files:**
- Modify: `src/server/api/routers/admin.ts`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Add admin.setUserPlan procedure**

```typescript
  setUserPlan: protectedProcedure
    .input(z.object({
      userId: z.string().uuid(),
      plan: z.enum(["FREE", "PREMIUM", "ENTERPRISE"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { isAdmin: true },
      });
      if (!user?.isAdmin) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return ctx.db.subscription.update({
        where: { userId: input.userId },
        data: { plan: input.plan },
      });
    }),
```

- [ ] **Step 2: Add subscription management section to admin page**

Add a simple section to the admin page: search for a user by email or wallet address, display their current plan, button to change plan (FREE/PREMIUM/ENTERPRISE).

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/admin.ts src/app/admin/page.tsx
git commit -m "feat: add admin subscription management"
```

---

## Verification Checklist

- [ ] `pnpm typecheck` — no errors
- [ ] `isPremium()` correctly identifies FREE vs PREMIUM/ENTERPRISE
- [ ] `canCreateSurvey()` enforces 5-survey limit for free tier
- [ ] `canAcceptResponse()` enforces 50-response limit for free tier creators
- [ ] PremiumGate renders upsell for free users, children for premium
- [ ] Survey builder: private/invite-only/results visibility gated with lock icons
- [ ] Dashboard: "New Survey" button gated at 5 surveys
- [ ] Landing page: shows limit message when 50 responses reached
- [ ] Results page: AI summaries gated with blurred upsell
- [ ] Chat sidebar: disabled for free users
- [ ] Downgrade: existing data preserved, new premium actions blocked
- [ ] Admin can set user plan via /admin
