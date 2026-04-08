import { CopyButton } from "./copy-button";

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function formatTimestamp(ts: Date | string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusIcon({ status }: { status: "verified" | "pending" | "not_published" }) {
  switch (status) {
    case "verified":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600 text-xs">
          &#x2713;
        </span>
      );
    case "pending":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-xs">
          &#x25CB;
        </span>
      );
    case "not_published":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-400 text-xs">
          &mdash;
        </span>
      );
  }
}

export function CheckItem({
  label,
  status,
  txHash,
  blockNumber,
  timestamp,
  basescanLink,
  ipfsCid,
}: {
  label: string;
  status: "verified" | "pending" | "not_published";
  txHash?: string | null;
  blockNumber?: string | null;
  timestamp?: Date | string | null;
  basescanLink?: string | null;
  ipfsCid?: string | null;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mt-0.5 shrink-0">
        <StatusIcon status={status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{label}</span>
          {status === "pending" && (
            <span className="text-xs text-amber-600">Pending</span>
          )}
          {status === "not_published" && (
            <span className="text-xs text-gray-400">Not yet published</span>
          )}
        </div>

        {txHash && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-gray-500">
              Tx:{" "}
              <code className="font-mono text-xs text-gray-700">
                {truncateHash(txHash)}
              </code>
              <CopyButton text={txHash} />
            </span>

            {basescanLink && (
              <a
                href={basescanLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                View on Basescan &#x2197;
              </a>
            )}
          </div>
        )}

        {(blockNumber ?? timestamp) && (
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {blockNumber && <span>Block: {blockNumber}</span>}
            {timestamp && <span>{formatTimestamp(timestamp)}</span>}
          </div>
        )}

        {ipfsCid && (
          <div className="mt-1.5 flex items-center gap-1 text-sm">
            <span className="text-gray-500">
              IPFS:{" "}
              <code className="font-mono text-xs text-gray-700">
                {truncateHash(ipfsCid)}
              </code>
              <CopyButton text={ipfsCid} />
            </span>
            <a
              href={`https://gateway.pinata.cloud/ipfs/${ipfsCid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              View on IPFS &#x2197;
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
