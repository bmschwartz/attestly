"use client";

export interface WizardStep {
  id: string;
  label: string;
  shortLabel: string;
  status: "incomplete" | "valid" | "error" | "active";
  enabled: boolean;
}

interface WizardStepperProps {
  steps: WizardStep[];
  currentStepId: string;
  onStepClick: (stepId: string) => void;
}

function StepIcon({
  status,
  number,
}: {
  status: WizardStep["status"];
  number: number;
}) {
  if (status === "valid") {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">
        ✓
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">
        !
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white ring-4 ring-blue-100">
        {number}
      </span>
    );
  }
  // incomplete
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-500">
      {number}
    </span>
  );
}

export function WizardStepper({
  steps,
  currentStepId,
  onStepClick,
}: WizardStepperProps) {
  return (
    <nav aria-label="Wizard steps" className="w-full">
      <ol className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const isClickable = step.enabled && step.id !== currentStepId;

          return (
            <li key={step.id} className="flex flex-1 items-center">
              {/* Step indicator */}
              <button
                type="button"
                onClick={() => isClickable && onStepClick(step.id)}
                disabled={!isClickable}
                className={[
                  "flex flex-col items-center gap-1",
                  isClickable
                    ? "cursor-pointer"
                    : "cursor-default",
                ].join(" ")}
                aria-current={step.id === currentStepId ? "step" : undefined}
              >
                <StepIcon status={step.status} number={index + 1} />
                {/* Desktop label */}
                <span
                  className={[
                    "hidden text-xs font-medium sm:block",
                    step.status === "active"
                      ? "text-blue-700"
                      : step.status === "valid"
                        ? "text-green-700"
                        : step.status === "error"
                          ? "text-red-700"
                          : "text-gray-500",
                  ].join(" ")}
                >
                  {step.label}
                </span>
                {/* Mobile label (short) */}
                <span
                  className={[
                    "block text-xs font-medium sm:hidden",
                    step.status === "active"
                      ? "text-blue-700"
                      : step.status === "valid"
                        ? "text-green-700"
                        : step.status === "error"
                          ? "text-red-700"
                          : "text-gray-500",
                  ].join(" ")}
                >
                  {step.shortLabel}
                </span>
              </button>

              {/* Connector line (not after last) */}
              {!isLast && (
                <div className="mx-2 h-0.5 flex-1 bg-gray-200" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
