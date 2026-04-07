"use client";

interface MultipleChoiceInputProps {
  options: string[];
  value: string; // JSON array string
  onChange: (value: string) => void;
  required?: boolean;
}

export function MultipleChoiceInput({ options, value, onChange }: MultipleChoiceInputProps) {
  const selected: string[] = value ? (JSON.parse(value) as string[]) : [];

  function toggleOption(option: string) {
    const updated = selected.includes(option)
      ? selected.filter((s) => s !== option)
      : [...selected, option].sort();
    onChange(JSON.stringify(updated));
  }

  return (
    <div className="space-y-2">
      {options.map((option) => (
        <label key={option} className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={selected.includes(option)}
            onChange={() => toggleOption(option)}
            className="h-4 w-4 rounded text-blue-600"
          />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}
