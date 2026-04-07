type DistributionItem = {
  value: number;
  count: number;
  percentage: number;
};

export function RatingResult({
  average,
  distribution,
  totalResponses,
  minRating,
  maxRating,
}: {
  average: number;
  distribution: DistributionItem[];
  totalResponses: number;
  minRating: number;
  maxRating: number;
}) {
  const maxPercentage = Math.max(...distribution.map((d) => d.percentage), 1);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        (Rating {minRating}-{maxRating} &middot; {totalResponses} response
        {totalResponses !== 1 ? "s" : ""})
      </p>

      {/* Average display */}
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold text-gray-900">
          {average.toFixed(1)}
        </span>
        <span className="text-sm text-gray-500">
          out of {maxRating}
        </span>
      </div>

      {/* Distribution bars */}
      <div className="space-y-2">
        {distribution.map((item) => (
          <div key={item.value} className="flex items-center gap-3">
            <span className="w-6 text-right text-sm font-medium text-gray-600">
              {item.value}
            </span>
            <div className="h-5 flex-1 rounded-full bg-gray-100">
              <div
                className="h-5 rounded-full bg-amber-500 transition-all duration-300"
                style={{
                  width: `${maxPercentage > 0 ? (item.percentage / maxPercentage) * 100 : 0}%`,
                  minWidth: item.count > 0 ? "0.5rem" : "0",
                }}
              />
            </div>
            <span className="w-20 text-right text-xs text-gray-500">
              {item.count} ({item.percentage}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
