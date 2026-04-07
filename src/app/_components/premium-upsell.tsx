interface PremiumUpsellProps {
  feature: string;
  message: string;
}

export function PremiumUpsell({ feature, message }: PremiumUpsellProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔒</span>
        <div>
          <p className="text-sm font-medium text-gray-700">{feature}</p>
          <p className="text-xs text-gray-500">{message}</p>
        </div>
      </div>
    </div>
  );
}
