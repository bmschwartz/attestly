"use client";

import { useState, useRef, useEffect } from "react";
import type { QuestionDraft } from "../_lib/validation";

const QUESTION_TYPES: {
  value: QuestionDraft["questionType"];
  label: string;
  description: string;
}[] = [
  {
    value: "SINGLE_SELECT",
    label: "Single Select",
    description: "Respondents pick one option",
  },
  {
    value: "MULTIPLE_CHOICE",
    label: "Multiple Choice",
    description: "Respondents select multiple options",
  },
  {
    value: "RATING",
    label: "Rating",
    description: "Respondents rate on a numeric scale",
  },
  {
    value: "FREE_TEXT",
    label: "Free Text",
    description: "Respondents write an open-ended answer",
  },
];

interface AddQuestionButtonProps {
  onAddQuestion: (type: QuestionDraft["questionType"]) => void;
}

export function AddQuestionButton({ onAddQuestion }: AddQuestionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (type: QuestionDraft["questionType"]) => {
    onAddQuestion(type);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600"
      >
        + Add Question
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 z-10 mt-2 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {QUESTION_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => handleSelect(type.value)}
              className="flex w-full flex-col px-4 py-2.5 text-left hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-900">
                {type.label}
              </span>
              <span className="text-xs text-gray-500">{type.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
