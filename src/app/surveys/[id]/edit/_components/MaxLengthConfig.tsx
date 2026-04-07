"use client";

interface MaxLengthConfigProps {
  maxLength: number | null;
  onChange: (value: number) => void;
  errors: string[];
}

export function MaxLengthConfig({
  maxLength,
  onChange,
  errors,
}: MaxLengthConfigProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-500">
        Max Character Length
      </label>
      <input
        type="number"
        value={maxLength ?? 500}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 500)}
        min={1}
        className="w-32 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {errors.map((err) => (
        <p key={err} className="text-xs text-red-600">{err}</p>
      ))}
    </div>
  );
}
