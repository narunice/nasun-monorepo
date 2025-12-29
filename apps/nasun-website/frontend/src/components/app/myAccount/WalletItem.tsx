/**
 * WalletItem Component
 *
 * Individual wallet card for displaying connection status.
 * Shows connected address or connect button.
 */

import React from "react";

interface WalletItemProps {
  icon: React.ReactNode;
  name: string;
  address?: string;
  isConnected: boolean;
  description: string;
  onConnect?: () => void;
  renderConnect?: React.ReactNode;
  isConnecting?: boolean;
}

/**
 * Truncate address to show first 6 and last 4 characters
 */
function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export const WalletItem: React.FC<WalletItemProps> = ({
  icon,
  name,
  address,
  isConnected,
  description,
  onConnect,
  renderConnect,
  isConnecting = false,
}) => {
  return (
    <div className="bg-nasun-c6/30 rounded-lg p-4 border border-nasun-c5/20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h6 className="font-medium text-nasun-white">{name}</h6>
            {isConnected && (
              <span className="text-green-400">✓</span>
            )}
          </div>
          <p className="text-nasun-white/50">{description}</p>
        </div>
      </div>

      {/* Connection Status / Address */}
      <div className="mt-3">
        {isConnected && address ? (
          <div className="flex items-center justify-between">
            <code className="text-nasun-white/80">
              {truncateAddress(address)}
            </code>
            <button
              className="text-nasun-c4 hover:underline"
              onClick={() => navigator.clipboard.writeText(address)}
            >
              Copy
            </button>
          </div>
        ) : renderConnect ? (
          <div className="w-full">{renderConnect}</div>
        ) : onConnect ? (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className="w-full py-2 px-4 bg-nasun-c4 hover:bg-nasun-c4/80 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? "Connecting..." : "Connect"}
          </button>
        ) : (
          <p className="text-nasun-white/50">Not connected</p>
        )}
      </div>
    </div>
  );
};

export default WalletItem;
