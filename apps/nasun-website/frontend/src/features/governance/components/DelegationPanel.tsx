/**
 * DelegationPanel Component
 *
 * UI for managing voting power delegation.
 * Allows users to delegate their voting power or view incoming delegations.
 */

import { FC, useState } from "react";
import { useWallet } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { useDelegation } from "../hooks/useDelegation";
import { Button } from "@/components/ui";
import { toast } from "react-toastify";

interface DelegationPanelProps {
  className?: string;
}

export const DelegationPanel: FC<DelegationPanelProps> = ({ className = "" }) => {
  const { status, account } = useWallet();
  const isConnected = status === "unlocked" && account;

  const { delegationState, isLoading, error, delegate, revoke } = useDelegation();

  const [delegateAddress, setDelegateAddress] = useState("");
  const [isPending, setIsPending] = useState(false);

  // Handle delegate action
  const handleDelegate = async () => {
    if (!delegateAddress.trim()) {
      toast.error("Please enter a valid address");
      return;
    }

    // Validate address format
    if (!delegateAddress.startsWith("0x") || delegateAddress.length !== 66) {
      toast.error("Invalid address format");
      return;
    }

    setIsPending(true);
    const success = await delegate(delegateAddress);

    if (success) {
      toast.success("Successfully delegated voting power!");
      setDelegateAddress("");
    } else {
      toast.error(error || "Failed to delegate");
    }
    setIsPending(false);
  };

  // Handle revoke action
  const handleRevoke = async () => {
    setIsPending(true);
    const success = await revoke();

    if (success) {
      toast.success("Successfully revoked delegation!");
    } else {
      toast.error(error || "Failed to revoke delegation");
    }
    setIsPending(false);
  };

  // Truncate address for display
  const truncateAddress = (addr: string) => {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className={`bg-nasun-c6 border border-nasun-c5/50 rounded-xl p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-nasun-white mb-4">
        Voting Power Delegation
      </h3>

      {/* Not Connected */}
      {!isConnected ? (
        <div className="text-center py-6">
          <p className="text-nasun-white/70 mb-4">
            Connect your wallet to manage delegation
          </p>
          <WalletConnect />
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-nasun-c3 border-t-transparent"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Current Delegation Status */}
          <div className="bg-nasun-black/30 rounded-lg p-4">
            <h4 className="text-sm font-medium text-nasun-white/70 mb-3">
              Your Delegation Status
            </h4>

            {delegationState?.hasDelegated ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-nasun-white/70">Delegated to:</span>
                  <span className="text-nasun-c3 font-mono text-sm">
                    {truncateAddress(delegationState.delegate || "")}
                  </span>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRevoke}
                  disabled={isPending}
                  className="w-full"
                >
                  {isPending ? "Revoking..." : "Revoke Delegation"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-nasun-white/50 text-sm">
                  You have not delegated your voting power
                </p>

                <div className="space-y-2">
                  <label className="text-sm text-nasun-white/70">
                    Delegate to address:
                  </label>
                  <input
                    type="text"
                    value={delegateAddress}
                    onChange={(e) => setDelegateAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full bg-nasun-black/50 border border-nasun-c5/30 rounded-lg px-4 py-2 text-nasun-white placeholder-nasun-white/30 focus:border-nasun-c3 focus:outline-none font-mono text-sm"
                  />
                </div>

                <Button
                  variant="c3"
                  size="sm"
                  onClick={handleDelegate}
                  disabled={isPending || !delegateAddress.trim()}
                  className="w-full"
                >
                  {isPending ? "Delegating..." : "Delegate Voting Power"}
                </Button>
              </div>
            )}
          </div>

          {/* Incoming Delegations */}
          <div className="bg-nasun-black/30 rounded-lg p-4">
            <h4 className="text-sm font-medium text-nasun-white/70 mb-3">
              Delegations Received
            </h4>

            {delegationState && delegationState.delegatorCount > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-nasun-white/70">Total delegators:</span>
                  <span className="text-nasun-c3 font-semibold">
                    {delegationState.delegatorCount}
                  </span>
                </div>
                <p className="text-xs text-nasun-white/50">
                  Their voting power will be added to yours when you vote.
                </p>
              </div>
            ) : (
              <p className="text-nasun-white/50 text-sm">
                No one has delegated to you yet
              </p>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-400 mb-2">
              How Delegation Works
            </h4>
            <ul className="text-xs text-nasun-white/70 space-y-1 list-disc list-inside">
              <li>You can delegate your voting power to another address</li>
              <li>The delegate can vote with your voting power</li>
              <li>You can revoke delegation at any time</li>
              <li>If you delegate, you cannot vote directly</li>
              <li>Circular delegation is not allowed</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default DelegationPanel;
