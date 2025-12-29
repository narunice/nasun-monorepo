/**
 * WalletItem Component
 *
 * Individual wallet card for displaying connection status.
 * Shows connected address with disconnect button, or connect button.
 */

import React from "react";
import { Button } from "../../ui/button";

interface WalletItemProps {
  icon: React.ReactNode;
  name: string;
  nameExtra?: React.ReactNode;
  address?: string;
  isConnected: boolean;
  description?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  renderConnect?: React.ReactNode;
  renderDisconnect?: React.ReactNode;
  isConnecting?: boolean;
  isDisconnecting?: boolean;
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
  nameExtra,
  address,
  isConnected,
  description,
  onConnect,
  onDisconnect,
  renderConnect,
  renderDisconnect,
  isConnecting = false,
  isDisconnecting = false,
}) => {
  return (
    <div className="bg-nasun-c6/30 rounded-lg p-4 border border-nasun-c5/20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h6 className="font-medium text-nasun-white">{name}</h6>
            {nameExtra}
            {isConnected && (
              <span className="text-green-400">✓</span>
            )}
          </div>
          {description && (
            <p className="text-nasun-white/50 text-sm">{description}</p>
          )}
        </div>
      </div>

      {/* Connection Status / Address */}
      <div className="mt-3">
        {isConnected && address ? (
          <div className="space-y-2">
            {/* Address with Copy */}
            <div className="flex items-center justify-between">
              <code className="text-nasun-white/80 text-sm">
                {truncateAddress(address)}
              </code>
              <button
                className="text-nasun-c4 hover:underline text-sm"
                onClick={() => navigator.clipboard.writeText(address)}
              >
                Copy
              </button>
            </div>
            {/* Disconnect button */}
            {renderDisconnect ? (
              <div className="w-full">{renderDisconnect}</div>
            ) : onDisconnect ? (
              <Button
                variant="filledOutlineScarlet"
                size="xs"
                onClick={onDisconnect}
                disabled={isDisconnecting}
                className="w-full"
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </Button>
            ) : null}
          </div>
        ) : renderConnect ? (
          <div className="w-full">{renderConnect}</div>
        ) : onConnect ? (
          <Button
            variant="filledOutlineC4"
            size="sm"
            onClick={onConnect}
            disabled={isConnecting}
            className="w-full"
          >
            {isConnecting ? "Connecting..." : "Connect"}
          </Button>
        ) : (
          <p className="text-nasun-white/50">Not connected</p>
        )}
      </div>
    </div>
  );
};

export default WalletItem;
