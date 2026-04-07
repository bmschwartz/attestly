import type { ReactNode } from "react";

type AccessGateProps = {
  surveyStatus: string;
  resultsVisibility: string;
  isLoading: boolean;
  error: { message: string } | null;
  children: ReactNode;
};

export function ResultsAccessGate({
  surveyStatus,
  resultsVisibility,
  isLoading,
  error,
  children,
}: AccessGateProps) {
  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-gray-500">Loading results...</p>
      </div>
    );
  }

  if (error) {
    const message = error.message;

    if (message === "Results are not yet available") {
      return (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">
              Results Not Yet Available
            </h2>
            <p className="mt-2 text-gray-500">
              Results will be available when this survey closes.
            </p>
          </div>
        </div>
      );
    }

    if (
      message === "Only the survey creator can view these results" ||
      message ===
        "Only respondents who submitted a response can view these results"
    ) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">
              Access Denied
            </h2>
            <p className="mt-2 text-gray-500">{message}.</p>
            {resultsVisibility === "RESPONDENTS" && (
              <p className="mt-1 text-sm text-gray-400">
                Submit a response to gain access to results.
              </p>
            )}
          </div>
        </div>
      );
    }

    if (message === "You must be signed in to view these results") {
      return (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">
              Sign In Required
            </h2>
            <p className="mt-2 text-gray-500">
              Please sign in to view these results.
            </p>
          </div>
        </div>
      );
    }

    if (message === "Survey not found") {
      return (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">Not Found</h2>
            <p className="mt-2 text-gray-500">
              This survey could not be found.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Error</h2>
          <p className="mt-2 text-gray-500">
            Something went wrong loading results. Please try again.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
