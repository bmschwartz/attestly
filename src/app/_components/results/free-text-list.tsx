type FreeTextResponse = {
  value: string;
  submittedAt: Date;
};

export function FreeTextList({
  responses,
  totalResponses,
  page,
  totalPages,
  onPageChange,
}: {
  responses: FreeTextResponse[];
  totalResponses: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalResponses === 0) {
    return (
      <div>
        <p className="text-xs text-gray-500">
          (Free Text &middot; 0 responses)
        </p>
        <p className="mt-2 text-sm text-gray-400">No responses yet.</p>
      </div>
    );
  }

  // If totalPages is 0, free text is hidden (private survey + PUBLIC results)
  if (totalPages === 0) {
    return (
      <div>
        <p className="text-xs text-gray-500">
          (Free Text &middot; {totalResponses} response
          {totalResponses !== 1 ? "s" : ""})
        </p>
        <p className="mt-2 text-sm text-gray-400">
          Individual free text responses are not displayed for this survey.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        (Free Text &middot; {totalResponses} response
        {totalResponses !== 1 ? "s" : ""})
      </p>

      <div className="space-y-3">
        {responses.map((response, index) => (
          <div
            key={`${page}-${index}`}
            className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
          >
            <p className="whitespace-pre-wrap text-sm text-gray-800">
              {response.value}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {new Date(response.submittedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        ))}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => {
                // Show first, last, current, and neighbors
                return (
                  p === 1 ||
                  p === totalPages ||
                  Math.abs(p - page) <= 1
                );
              })
              .reduce<(number | "ellipsis")[]>((acc, p, i, arr) => {
                if (i > 0) {
                  const prev = arr[i - 1];
                  if (prev !== undefined && p - prev > 1) {
                    acc.push("ellipsis");
                  }
                }
                acc.push(p);
                return acc;
              }, [])
              .map((item, index) =>
                item === "ellipsis" ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="px-1 text-gray-400"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    onClick={() => onPageChange(item)}
                    className={`h-8 w-8 rounded-md text-sm ${
                      item === page
                        ? "bg-blue-600 font-medium text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {item}
                  </button>
                ),
              )}
          </div>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
