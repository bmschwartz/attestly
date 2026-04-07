type BarChartOption = {
  value: string;
  count: number;
  percentage: number;
};

export function BarChart({
  options,
  totalResponses,
  questionType,
}: {
  options: BarChartOption[];
  totalResponses: number;
  questionType: "SINGLE_SELECT" | "MULTIPLE_CHOICE";
}) {
  const maxPercentage = Math.max(...options.map((o) => o.percentage), 1);

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        ({questionType === "SINGLE_SELECT" ? "Single Select" : "Multiple Choice"}{" "}
        &middot; {totalResponses} response{totalResponses !== 1 ? "s" : ""})
      </p>
      {options.map((option) => (
        <div key={option.value} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">{option.value}</span>
            <span className="text-gray-500">
              {option.count} ({option.percentage}%)
            </span>
          </div>
          <div className="h-6 w-full rounded-full bg-gray-100">
            <div
              className="h-6 rounded-full bg-blue-500 transition-all duration-300"
              style={{
                width: `${maxPercentage > 0 ? (option.percentage / maxPercentage) * 100 : 0}%`,
                minWidth: option.count > 0 ? "0.5rem" : "0",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
