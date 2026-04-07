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
        <p className="text-sm font-medium text-gray-600">{upsell?.feature}</p>
        <p className="text-xs text-gray-400">{upsell?.message}</p>
      </div>
    </div>
  );
}
