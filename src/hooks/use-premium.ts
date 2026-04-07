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
