"use client";

import { useCallback } from "react";

interface OptionsEditorProps {
  options: string[];
  onChange: (options: string[]) => void;
  errors: string[];
}

export function OptionsEditor({ options, onChange, errors }: OptionsEditorProps) {
  const handleOptionChange = useCallback(
    (index: number, value: string) => {
      const updated = [...options];
      updated[index] = value;
      onChange(updated);
    },
    [options, onChange],
  );

  const handleAddOption = useCallback(() => {
    onChange([...options, ""]);
  }, [options, onChange]);

  const handleRemoveOption = useCallback(
    (index: number) => {
      if (options.length <= 2) return; // Enforce minimum 2 options
      const updated = options.filter((_, i) => i !== index);
      onChange(updated);
    },
    [options, onChange],
  );

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-500">Options</label>
      {options.map((option, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="w-5 text-center text-xs text-gray-400">
            {index + 1}.
          </span>
          <input
            type="text"
            value={option}
            onChange={(e) => handleOptionChange(index, e.target.value)}
            placeholder={`Option ${index + 1}`}
            className="block flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => handleRemoveOption(index)}
            disabled={options.length <= 2}
            className="text-gray-400 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
            title="Remove option"
          >
            x
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={handleAddOption}
        className="text-sm text-blue-600 hover:text-blue-700"
      >
        + Add option
      </button>
      {errors.map((err) => (
        <p key={err} className="text-xs text-red-600">{err}</p>
      ))}
    </div>
  );
}
