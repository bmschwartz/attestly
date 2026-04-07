"use client";

interface FreeTextInputProps {
  maxLength: number;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function FreeTextInput({ maxLength, value, onChange }: FreeTextInputProps) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        className="w-full rounded border px-3 py-2"
        rows={4}
        placeholder="Type your answer..."
      />
      <p className="mt-1 text-right text-xs text-gray-400">
        {value.length} / {maxLength}
      </p>
    </div>
  );
}
