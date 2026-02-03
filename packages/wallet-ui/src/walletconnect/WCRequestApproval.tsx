/**
 * WCRequestApproval
 *
 * Displays a WalletConnect request (sign message, send transaction, etc.)
 * and allows the user to approve or reject it.
 */

import { useState } from "react";
import {
  useWalletConnect,
  getRequestDescription,
  getDAppMetadata,
} from "@nasun/wallet";
import type { ViewMode } from "../connect/LockedStateUI";
import { sanitizeImageUrl } from "../shared";

interface WCRequestApprovalProps {
  setViewMode: (mode: ViewMode) => void;
}

export function WCRequestApproval({ setViewMode }: WCRequestApprovalProps) {
  const { state, approveRequest, rejectRequest } = useWalletConnect();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = state.pendingRequests[0];

  if (!request) {
    return (
      <div className="p-4 w-full">
        <BackButton onClick={() => setViewMode("wc-main")} />
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 dark:text-zinc-400">No pending requests</p>
        </div>
      </div>
    );
  }

  // Find the session for this request
  const session = state.sessions.find((s) => s.topic === request.topic);
  const dAppMeta = session ? getDAppMetadata(session) : null;
  const description = getRequestDescription(request);

  const handleApprove = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await approveRequest(request);
      setViewMode("wc-main");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve request");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await rejectRequest(request);
      setViewMode("wc-main");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject request");
    } finally {
      setIsLoading(false);
    }
  };

  // Format request params for display
  const formatParams = () => {
    try {
      const params = request.params;
      if (typeof params === "string") return params;
      return JSON.stringify(params, null, 2);
    } catch {
      return String(request.params);
    }
  };

  // Determine request type category for styling
  const isSignRequest = request.method.includes("sign");
  const isTxRequest = request.method.includes("Transaction") || request.method.includes("send");

  return (
    <div className="p-4 w-full">
      <BackButton onClick={() => setViewMode("wc-main")} />

      <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white mb-3">
        {description}
      </h3>

      {/* dApp info */}
      {dAppMeta && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 dark:bg-zinc-700/50 rounded">
          <DAppAvatar name={dAppMeta.name} icon={dAppMeta.icons[0]} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {dAppMeta.name}
            </p>
            <p className="text-[10px] text-gray-500 dark:text-zinc-400 truncate">
              {dAppMeta.url}
            </p>
          </div>
        </div>
      )}

      {/* Request details */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
            isTxRequest
              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
              : isSignRequest
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
          }`}>
            {request.method}
          </span>
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 dark:bg-zinc-600 text-gray-600 dark:text-zinc-300 rounded">
            {request.chainId}
          </span>
        </div>

        {/* Params display */}
        <div className="bg-gray-50 dark:bg-zinc-700/50 border border-gray-200 dark:border-zinc-600 rounded p-2 max-h-[200px] overflow-y-auto">
          <pre className="text-[10px] text-gray-700 dark:text-zinc-300 font-mono whitespace-pre-wrap break-all">
            {formatParams()}
          </pre>
        </div>
      </div>

      {/* Warning for transaction requests */}
      {isTxRequest && (
        <div className="mb-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-[10px] text-yellow-600 dark:text-yellow-400">
              This will execute a transaction on the blockchain. Review carefully before approving.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleReject}
          disabled={isLoading}
          className="flex-1 px-3 py-2 text-sm text-gray-600 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 rounded font-medium transition-colors disabled:opacity-50"
        >
          Reject
        </button>
        <button
          onClick={handleApprove}
          disabled={isLoading}
          className={`flex-1 px-3 py-2 text-sm text-white font-medium rounded transition-colors disabled:opacity-50 ${
            isTxRequest
              ? "bg-orange-600 hover:bg-orange-700"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {isLoading ? "Processing..." : isTxRequest ? "Confirm & Send" : "Sign"}
        </button>
      </div>
    </div>
  );
}

// -- Helper Components --

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-3"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  );
}

function DAppAvatar({ name, icon }: { name: string; icon?: string }) {
  const [imgError, setImgError] = useState(false);
  const safeIcon = sanitizeImageUrl(icon);

  if (!safeIcon || imgError) {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-zinc-600 flex items-center justify-center text-gray-500 dark:text-zinc-400 font-medium text-xs">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={safeIcon}
      alt={name}
      className="w-8 h-8 rounded-full"
      onError={() => setImgError(true)}
    />
  );
}
