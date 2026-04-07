"use client";

interface BuilderFooterProps {
  questionCount: number;
  status: string;
}

export function BuilderFooter({ questionCount, status }: BuilderFooterProps) {
  return (
    <footer className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-2">
      <span className="text-sm text-gray-500">
        {questionCount} question{questionCount !== 1 ? "s" : ""}
      </span>
      <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
        {status}
      </span>
    </footer>
  );
}
