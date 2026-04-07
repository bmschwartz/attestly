"use client";

interface RatingInputProps {
  minRating: number;
  maxRating: number;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function RatingInput({ minRating, maxRating, value, onChange }: RatingInputProps) {
  const range = maxRating - minRating + 1;

  if (range > 10) {
    return (
      <input
        type="number"
        min={minRating}
        max={maxRating}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded border px-3 py-2"
        placeholder={`${minRating}-${maxRating}`}
      />
    );
  }

  return (
    <div className="flex gap-2">
      {Array.from({ length: range }, (_, i) => minRating + i).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(String(n))}
          className={`h-10 w-10 rounded-lg border text-sm font-medium transition ${
            value === String(n)
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-gray-300 hover:border-blue-400"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
