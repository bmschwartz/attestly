"use client";

interface RatingConfigProps {
  minRating: number | null;
  maxRating: number | null;
  onChangeMin: (value: number) => void;
  onChangeMax: (value: number) => void;
  errors: string[];
}

export function RatingConfig({
  minRating,
  maxRating,
  onChangeMin,
  onChangeMax,
  errors,
}: RatingConfigProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-500">
        Rating Range
      </label>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">Min:</label>
          <input
            type="number"
            value={minRating ?? 1}
            onChange={(e) => onChangeMin(parseInt(e.target.value, 10) || 1)}
            className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <span className="text-gray-400">to</span>
        <div className="flex items-center gap-1">
          <label className="text-xs text-gray-500">Max:</label>
          <input
            type="number"
            value={maxRating ?? 5}
            onChange={(e) => onChangeMax(parseInt(e.target.value, 10) || 5)}
            className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      {errors.map((err) => (
        <p key={err} className="text-xs text-red-600">{err}</p>
      ))}
    </div>
  );
}
