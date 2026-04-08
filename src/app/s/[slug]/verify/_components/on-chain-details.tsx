import { CheckItem } from "./check-item";

type ProofData = {
  surveyHash: string | null;
  ipfsCid: string | null;
  publishTxHash: string | null;
  publishBlockNumber: string | null;
  publishBlockTimestamp: Date | null;
  closeTxHash: string | null;
  closeBlockNumber: string | null;
  closeBlockTimestamp: Date | null;
  basescanLinks: Record<string, string>;
  verificationStatus: string;
} | null;

type ResponseCountSummary = {
  platformCount: number;
  verifiedCount: number;
};

type IntegrityResult =
  | { status: "pending"; message: string }
  | {
      status: "complete";
      passed: boolean;
      dbResponseCount: number;
      onChainResponseCount: number;
      ipfsVerifiedCount: number;
      errors: string[];
      verifiedAt: Date;
    };

export function OnChainDetails({
  proofData,
  responseCountSummary,
  integrityResult,
}: {
  proofData: ProofData;
  responseCountSummary: ResponseCountSummary;
  integrityResult: IntegrityResult;
}) {
  if (!proofData) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">
        On-Chain Details
      </h2>

      <div className="space-y-3">
        <CheckItem
          label="Survey Published"
          status={proofData.publishTxHash ? "verified" : "pending"}
          txHash={proofData.publishTxHash}
          blockNumber={proofData.publishBlockNumber}
          timestamp={proofData.publishBlockTimestamp}
          basescanLink={proofData.basescanLinks.publish}
          ipfsCid={proofData.ipfsCid}
        />

        <CheckItem
          label="Survey Closed"
          status={
            proofData.closeTxHash
              ? "verified"
              : "not_published"
          }
          txHash={proofData.closeTxHash}
          blockNumber={proofData.closeBlockNumber}
          timestamp={proofData.closeBlockTimestamp}
          basescanLink={proofData.basescanLinks.close}
        />
      </div>

      {/* Response count summary */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-900">Responses</h3>
        <div className="mt-2 flex gap-6 text-sm text-gray-600">
          <span>
            Total submitted:{" "}
            <span className="font-medium text-gray-900">
              {responseCountSummary.platformCount}
            </span>
          </span>
          <span>
            Verified on-chain:{" "}
            <span className="font-medium text-gray-900">
              {responseCountSummary.verifiedCount}
            </span>
          </span>
        </div>
      </div>

      {/* Cached integrity result */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-900">
          Response Integrity Check
        </h3>
        {integrityResult.status === "pending" ? (
          <p className="mt-2 text-sm text-gray-500">
            Verification will run when the survey closes.
          </p>
        ) : (
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  integrityResult.passed ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className={integrityResult.passed ? "text-green-700" : "text-red-700"}>
                {integrityResult.passed ? "Passed" : "Failed"}
              </span>
            </div>
            <div className="text-gray-500">
              DB responses: {integrityResult.dbResponseCount} | On-chain:{" "}
              {integrityResult.onChainResponseCount} | IPFS verified:{" "}
              {integrityResult.ipfsVerifiedCount}
            </div>
            <div className="text-xs text-gray-400">
              Last verified: {new Date(integrityResult.verifiedAt).toLocaleString()}
            </div>
            {integrityResult.errors.length > 0 && (
              <div className="mt-1 text-xs text-red-600">
                {integrityResult.errors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
