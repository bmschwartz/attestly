"use client";

import { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { api } from "~/trpc/react";
import { buildCloseSurveyTypedData } from "~/lib/eip712/domain";
import { signCloseSurvey } from "~/lib/eip712/sign";

export function CloseSurveyDialog({
  surveyId,
  contentHash,
  onClose,
}: {
  surveyId: string;
  contentHash: string | null;
  onClose: () => void;
}) {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const utils = api.useUtils();
  const [signingError, setSigningError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);

  const walletAddress = user?.wallet?.address;
  const walletReady = !!walletAddress && !!contentHash;

  const closeSurvey = api.survey.close.useMutation({
    onSuccess: () => {
      void utils.survey.listMine.invalidate();
      void utils.survey.getStats.invalidate();
      onClose();
    },
  });

  const handleClose = async () => {
    if (!walletAddress || !contentHash) return;
    setSigningError(null);
    setIsSigning(true);

    try {
      // Find the embedded wallet and get provider
      const embeddedWallet = wallets.find(
        (w) => w.address.toLowerCase() === walletAddress.toLowerCase(),
      );
      if (!embeddedWallet) {
        setSigningError("Wallet not found. Please try again.");
        setIsSigning(false);
        return;
      }
      const provider = await embeddedWallet.getEthereumProvider();

      const signature = await signCloseSurvey(
        provider,
        walletAddress as `0x${string}`,
        { surveyHash: contentHash as `0x${string}` },
      );

      closeSurvey.mutate({ id: surveyId, signature });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Signing failed";
      if (message.includes("rejected") || message.includes("denied")) {
        setSigningError("Signature rejected. Please try again.");
      } else {
        setSigningError(message);
      }
    } finally {
      setIsSigning(false);
    }
  };

  const isDisabled = !walletReady || closeSurvey.isPending || isSigning;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">
          Close this survey?
        </h3>
        <div className="mt-2 space-y-2 text-sm text-gray-600">
          <p>Closing a survey will:</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Stop accepting new responses immediately</li>
            <li>Discard any in-progress (incomplete) responses</li>
            <li>
              Notify all respondents who submitted a response via email
            </li>
          </ul>
          <p className="font-medium text-gray-700">
            This action cannot be undone.
          </p>
        </div>

        {signingError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {signingError}
          </p>
        )}

        {!walletReady && (
          <p className="mt-3 text-xs text-amber-600">
            Wallet not ready. Please wait...
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleClose()}
            disabled={isDisabled}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isSigning
              ? "Signing..."
              : closeSurvey.isPending
                ? "Closing..."
                : "Close Survey"}
          </button>
        </div>
      </div>
    </div>
  );
}
