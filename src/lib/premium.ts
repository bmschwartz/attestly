import type { SubscriptionPlan, SubscriptionStatus } from "../../generated/prisma";

/**
 * Downgrade behavior:
 * - Grandfathered: existing private surveys stay private, existing invites remain
 * - Gated: AI summaries hidden, chat disabled, verification bundles gated
 * - Revoked: can't create new private/invite-only surveys, limits re-apply
 * This works because all gates check CURRENT subscription, not historical.
 */

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
