/**
 * DelegationPanel Component
 *
 * UI for managing voting power delegation.
 * Allows users to delegate their voting power or view incoming delegations.
 */

import { FC, useState } from "react";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { useDelegation } from "../hooks/useDelegation";
import { Button, OuterBox, DividerBox } from "@/components/ui";
import { toast } from "react-toastify";

interface DelegationPanelProps {
  className?: string;
}

export const DelegationPanel: FC<DelegationPanelProps> = ({ className = "" }) => {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const isConnected = (status === "unlocked" && account) || isZkConnected;

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
    <OuterBox color="n2" padding="md" className={`h-full ${className}`}>
      <h3 className="text-lg font-medium text-nasun-white mb-4">
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
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-nasun-c4 border-t-transparent"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Current Delegation Status */}
          <DividerBox color="n1" padding="sm">
            <h4 className="text-sm font-medium text-nasun-white/70 mb-3">
              Your Delegation Status
            </h4>

            {delegationState?.hasDelegated ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-nasun-white/70">Delegated to:</span>
                  <span className="text-nasun-c4 font-mono text-sm">
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
                    className="w-full bg-nasun-black/50 border border-nasun-c5/30 rounded-sm px-4 py-2 text-nasun-white placeholder-nasun-white/30 focus:border-nasun-c4 focus:outline-none font-mono text-sm transition-colors"
                  />
                </div>

                <Button
                  variant="c4"
                  size="sm"
                  onClick={handleDelegate}
                  disabled={isPending || !delegateAddress.trim()}
                  className="w-full"
                >
                  {isPending ? "Delegating..." : "Delegate Voting Power"}
                </Button>
              </div>
            )}
          </DividerBox>

          {/* Incoming Delegations */}
          <DividerBox color="n1" padding="sm">
            <h4 className="text-sm font-medium text-nasun-white/70 mb-3">
              Delegations Received
            </h4>

            {delegationState && delegationState.delegatorCount > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-nasun-white/70">Total delegators:</span>
                  <span className="text-nasun-c4 font-semibold">
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
          </DividerBox>

          {/* Info Box */}
          <div className="bg-nasun-c4/10 border border-nasun-c4/30 rounded-sm p-4">
            <h4 className="text-sm font-medium text-nasun-c4 mb-2">
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
    </OuterBox>
  );
};

export default DelegationPanel;