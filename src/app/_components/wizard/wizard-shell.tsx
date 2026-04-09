"use client";

import { useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { WizardStepper } from "./wizard-stepper";
import type { WizardStep } from "./wizard-stepper";

export interface WizardShellStep {
  id: string;
  label: string;
  shortLabel: string;
  enabled: boolean;
  hasErrors: boolean;
  isComplete: boolean;
  content: ReactNode;
}

interface WizardShellProps {
  steps: WizardShellStep[];
  initialStepId: string;
  /** Called before navigation — use this to save current step data. */
  onStepChange?: (fromStepId: string, toStepId: string) => Promise<void>;
  /** External navigation request — when set, the wizard navigates to this step. */
  goToStepId?: string | null;
}

function toStepperStep(
  shell: WizardShellStep,
  currentStepId: string,
): WizardStep {
  let status: WizardStep["status"];
  if (shell.id === currentStepId) {
    status = "active";
  } else if (shell.hasErrors) {
    status = "error";
  } else if (shell.isComplete) {
    status = "valid";
  } else {
    status = "incomplete";
  }

  return {
    id: shell.id,
    label: shell.label,
    shortLabel: shell.shortLabel,
    status,
    enabled: shell.enabled,
  };
}

export function WizardShell({
  steps: rawSteps,
  initialStepId,
  onStepChange,
  goToStepId,
}: WizardShellProps) {
  const [currentStepId, setCurrentStepId] = useState(initialStepId);
  const [isNavigating, setIsNavigating] = useState(false);
  const [visitedSteps, setVisitedSteps] = useState<Set<string>>(
    () => new Set([initialStepId]),
  );

  // Suppress errors on steps the user hasn't visited yet
  const steps = rawSteps.map((s) => ({
    ...s,
    hasErrors: visitedSteps.has(s.id) ? s.hasErrors : false,
  }));

  const navigateTo = useCallback(
    async (toStepId: string) => {
      if (toStepId === currentStepId) return;
      const target = rawSteps.find((s) => s.id === toStepId);
      if (!target?.enabled) return;

      setIsNavigating(true);
      try {
        await onStepChange?.(currentStepId, toStepId);
      } finally {
        setVisitedSteps((prev) => new Set(prev).add(toStepId));
        setCurrentStepId(toStepId);
        setIsNavigating(false);
      }
    },
    [currentStepId, rawSteps, onStepChange],
  );

  // Handle external navigation requests (e.g., "Edit →" buttons on Review step)
  useEffect(() => {
    if (goToStepId && goToStepId !== currentStepId) {
      void navigateTo(goToStepId);
    }
  }, [goToStepId, currentStepId, navigateTo]);

  const currentIndex = steps.findIndex((s) => s.id === currentStepId);
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === steps.length - 1;

  const handleBack = useCallback(() => {
    if (isFirst) return;
    const prev = steps[currentIndex - 1];
    if (prev) void navigateTo(prev.id);
  }, [isFirst, currentIndex, steps, navigateTo]);

  const handleNext = useCallback(() => {
    if (isLast) return;
    const next = steps[currentIndex + 1];
    if (next) void navigateTo(next.id);
  }, [isLast, currentIndex, steps, navigateTo]);

  const stepperSteps = steps.map((s) => toStepperStep(s, currentStepId));
  const currentStep = steps[currentIndex];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Stepper header */}
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-6">
        <div className="mx-auto max-w-4xl">
          <WizardStepper
            steps={stepperSteps}
            currentStepId={currentStepId}
            onStepClick={(id) => void navigateTo(id)}
          />
        </div>
      </header>

      {/* Step content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          {currentStep?.content}
        </div>
      </main>

      {/* Navigation footer */}
      <footer className="sticky bottom-0 z-10 border-t border-gray-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          {/* Back */}
          <button
            type="button"
            onClick={handleBack}
            disabled={isFirst || isNavigating}
            className={[
              "rounded-lg px-5 py-2 text-sm font-medium transition-colors",
              isFirst
                ? "invisible"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50",
            ].join(" ")}
          >
            Back
          </button>

          {/* Next (hidden on last step) */}
          {!isLast && (
            <button
              type="button"
              onClick={handleNext}
              disabled={isNavigating}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isNavigating ? "Saving…" : "Next"}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
