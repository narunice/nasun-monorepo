/**
 * Add Custom ERC-20 Token Form
 * Allows user to add a custom ERC-20 token by contract address.
 * Looks up metadata on-chain, then saves to localStorage.
 */

import { useState } from "react";
import {
  getEVMClient,
  getERC20Metadata,
  addCustomERC20Token,
  useChain,
  useRefreshERC20Balances,
} from "@nasun/wallet";

const MAX_SYMBOL_LENGTH = 12;
const MAX_NAME_LENGTH = 64;
const MAX_DECIMALS = 18;

/** Strip control characters and bidirectional override codepoints */
function sanitizeTokenString(str: string, maxLength: number): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').trim().slice(0, maxLength);
}

interface AddERC20TokenProps {
  onClose: () => void;
}

export function AddERC20Token({ onClose }: AddERC20TokenProps) {
  const { chain } = useChain();
  const refreshERC20 = useRefreshERC20Balances();

  const [address, setAddress] = useState("");
  const [isLooking, setIsLooking] = useState(false);
  const [metadata, setMetadata] = useState<{
    symbol: string;
    name: string;
    decimals: number;
  } | null>(null);
  const [error, setError] = useState("");

  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(address);

  const handleLookup = async () => {
    if (!isValidAddress) {
      setError("Invalid contract address");
      return;
    }

    setIsLooking(true);
    setError("");
    setMetadata(null);

    try {
      const client = getEVMClient(chain);
      const result = await getERC20Metadata(client, address as `0x${string}`);
      if (!result) {
        setError("Not a valid ERC-20 contract");
        return;
      }
      // Validate decimals range
      if (!Number.isInteger(result.decimals) || result.decimals < 0 || result.decimals > MAX_DECIMALS) {
        setError("Invalid token decimals (must be 0-18)");
        return;
      }

      // Sanitize metadata to prevent impersonation via Unicode tricks
      setMetadata({
        symbol: sanitizeTokenString(result.symbol, MAX_SYMBOL_LENGTH),
        name: sanitizeTokenString(result.name, MAX_NAME_LENGTH),
        decimals: result.decimals,
      });
    } catch {
      setError("Failed to fetch token metadata");
    } finally {
      setIsLooking(false);
    }
  };

  const handleAdd = () => {
    if (!metadata) return;

    addCustomERC20Token(chain.id, {
      address: address as `0x${string}`,
      symbol: metadata.symbol,
      name: metadata.name,
      decimals: metadata.decimals,
    });

    refreshERC20();
    onClose();
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm md:text-base xl:text-lg font-bold text-gray-900 dark:text-white">
          Add Custom Token
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mb-3">
        Enter the ERC-20 token contract address on {chain.name}.
      </p>

      {/* Address input */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value.trim());
            setMetadata(null);
            setError("");
          }}
          onKeyDown={(e) => e.key === 'Enter' && isValidAddress && !isLooking && handleLookup()}
          placeholder="0x..."
          className="flex-1 px-3 py-2 text-sm xl:text-base bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleLookup}
          disabled={!isValidAddress || isLooking}
          className="px-3 py-2 text-sm xl:text-base bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-700 text-white disabled:text-gray-500 dark:disabled:text-zinc-500 rounded transition-colors"
        >
          {isLooking ? "..." : "Lookup"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs xl:text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>
      )}

      {/* Metadata display */}
      {metadata && (
        <div className="p-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded mb-3">
          <div className="flex items-center justify-between text-sm xl:text-base mb-1">
            <span className="text-gray-500 dark:text-zinc-400">Symbol</span>
            <span className="font-medium text-gray-900 dark:text-white">{metadata.symbol}</span>
          </div>
          <div className="flex items-center justify-between text-sm xl:text-base mb-1">
            <span className="text-gray-500 dark:text-zinc-400">Name</span>
            <span className="font-medium text-gray-900 dark:text-white">{metadata.name}</span>
          </div>
          <div className="flex items-center justify-between text-sm xl:text-base">
            <span className="text-gray-500 dark:text-zinc-400">Decimals</span>
            <span className="font-medium text-gray-900 dark:text-white">{metadata.decimals}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-2 text-sm xl:text-base text-gray-700 dark:text-zinc-300 border border-gray-200 dark:border-zinc-700 rounded hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors"
        >
          Cancel
        </button>
        {metadata && (
          <button
            onClick={handleAdd}
            className="flex-1 py-2 text-sm xl:text-base bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            Add {metadata.symbol}
          </button>
        )}
      </div>
    </div>
  );
}
