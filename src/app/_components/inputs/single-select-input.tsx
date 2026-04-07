"use client";

interface SingleSelectInputProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function SingleSelectInput({ options, value, onChange }: SingleSelectInputProps) {
  return (
    <div className="space-y-2">
      {options.map((option) => (
        <label key={option} className="flex cursor-pointer items-center gap-3">
          <input
            type="radio"
            name={`single-select-${options[0]}`}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className="h-4 w-4 text-blue-600"
          />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}
