import type { VerificationStatus } from "../../../generated/prisma";

type BadgeStatus = VerificationStatus | "SUBMITTED";

const CONFIG: Record<
  Exclude<BadgeStatus, "NONE">,
  { dot: string; label: string; classes: string }
> = {
  VERIFIED: {
    dot: "bg-green-500",
    label: "Verified on-chain",
    classes: "bg-green-50 text-green-700 border-green-200",
  },
  PENDING: {
    dot: "bg-amber-500",
    label: "Verification pending",
    classes: "bg-amber-50 text-amber-700 border-amber-200",
  },
  SUBMITTED: {
    dot: "bg-blue-500",
    label: "Confirming on-chain",
    classes: "bg-blue-50 text-blue-700 border-blue-200",
  },
  FAILED: {
    dot: "bg-red-500",
    label: "Verification issue",
    classes: "bg-red-50 text-red-700 border-red-200",
  },
};

export function VerificationBadge({
  status,
  size = "sm",
  showLabel = true,
}: {
  status: BadgeStatus;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  if (status === "NONE") return null;

  const cfg = CONFIG[status];
  if (!cfg) return null;

  const sizeClasses =
    size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs";

  const dotSize = size === "md" ? "h-2 w-2" : "h-1.5 w-1.5";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${sizeClasses} ${cfg.classes}`}
    >
      <span className={`inline-block rounded-full ${dotSize} ${cfg.dot}`} />
      {showLabel && cfg.label}
    </span>
  );
}
