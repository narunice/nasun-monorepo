/**
 * CompactNftStatus Component
 *
 * Event participation status cards in the My Account Bento Grid.
 * Shows: Genesis Pass Allowlist, Leaderboard Event, Battalion NFT Allowlist.
 *
 * NOTE: Frontiers Whitelist is hidden during Battalion NFT campaign.
 * It will be re-added when Frontiers NFT campaign starts (post-Battalion sales).
 */

import { FC, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuth } from "@/features/auth";
import { useBattalionNftStatus } from "../../hooks/useBattalionNftStatus";
import { useGenesisPassStatus, invalidateGenesisPassStatus } from "../../hooks/useGenesisPassStatus";
import { registerGenesisPass } from "../../services/genesisPassApi";
import { OuterBox, Spinner } from "@/components/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface CompactNftStatusProps {
  className?: string;
}

const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

export const CompactNftStatus: FC<CompactNftStatusProps> = ({ className = "" }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const cognitoToken = user?.cognitoToken;

  // X account (for Leaderboard + Battalion NFT)
  const twitterId = user?.twitterId ?? user?.linkedAccounts?.twitter?.twitterId;
  const effectiveXUserId = twitterId;

  // EVM wallet address (for Genesis Pass) - MetaMask only, not Nasun Wallet
  const evmWalletAddress =
    user?.linkedAccounts?.metamask?.walletAddress?.toLowerCase() ||
    (user?.provider === "MetaMask" ? user.walletAddress?.toLowerCase() : undefined);

  // Battalion NFT Status
  const {
    isRegistered: isBattalionRegistered,
    isLoading: isBattalionLoading,
    status: battalionStatus,
  } = useBattalionNftStatus(undefined, effectiveXUserId);

  // Genesis Pass Status (falls back to identity-based check when wallet is unavailable)
  const {
    isRegistered: isGenesisPassRegistered,
    registeredWallet: genesisPassWallet,
    isLoading: isGenesisPassLoading,
    isConfigured: isGenesisPassConfigured,
  } = useGenesisPassStatus(evmWalletAddress, cognitoToken);

  // Wallet mismatch detection
  const hasMismatch = isGenesisPassRegistered
    && evmWalletAddress
    && genesisPassWallet
    && genesisPassWallet.toLowerCase() !== evmWalletAddress.toLowerCase();

  const [showMismatchDialog, setShowMismatchDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateWallet = async () => {
    if (isUpdating || !cognitoToken) return;

    try {
      setIsUpdating(true);
      await registerGenesisPass(cognitoToken);
      toast.success("Allowlist wallet address updated.");
      setShowMismatchDialog(false);
      invalidateGenesisPassStatus();
    } catch (err) {
      console.error("[CompactNftStatus] Wallet update error:", err);
      toast.error("Failed to update wallet address. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  // No accounts linked and not authenticated
  if (!effectiveXUserId && !evmWalletAddress && !cognitoToken) {
    return (
      <OuterBox color="c5" padding="sm" className={`animate-fade-slide-up ${className}`}>
        <h5 className="font-medium uppercase text-nasun-white mb-4">STATUS</h5>
        <p className="text-nasun-white/50">
          Link your X account or EVM wallet to participate in events
        </p>
      </OuterBox>
    );
  }

  return (
    <>
      <OuterBox color="c5" padding="sm" className={`animate-fade-slide-up ${className}`}>
        <h5 className="font-medium uppercase text-nasun-white mb-4">STATUS</h5>
        <div className="flex flex-col gap-3">
          {/* Genesis Pass Allowlist */}
          {isGenesisPassConfigured && (
            <div className="flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
              <h6 className="text-nasun-white">Genesis Pass Allowlist</h6>
              <div className="flex items-center justify-between">
                {isGenesisPassLoading ? (
                  <Spinner size="sm" />
                ) : isGenesisPassRegistered ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-green-400 text-sm">&#10003; Registered</span>
                    {genesisPassWallet && (
                      <span className="text-nasun-white/50 text-xs font-mono">
                        {shortenAddress(genesisPassWallet)}
                      </span>
                    )}
                    {hasMismatch && (
                      <button
                        onClick={() => setShowMismatchDialog(true)}
                        className="text-yellow-400 text-xs text-left hover:underline"
                      >
                        Wallet mismatch - click to update
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-nasun-white/50 text-sm">Not Registered</span>
                )}
                {!isGenesisPassLoading && !isGenesisPassRegistered && evmWalletAddress && (
                  <Button
                    variant="filledOutlineC7"
                    size="sm"
                    disabled
                  >
                    Register
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Leaderboard Event CTA (requires X account) */}
          {effectiveXUserId && (
            <div className="flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
              <h6 className="text-nasun-white">Leaderboard Event</h6>
              <p className="text-nasun-white/70 text-sm">
                You're in! Share content about Nasun and get recognized.
              </p>
              <Button onClick={() => navigate("/wave1/leaderboard-guide")} variant="filledOutlineC7" size="sm" className="self-end mt-1">
                Learn More
              </Button>
            </div>
          )}

          {/* Battalion NFT Allowlist (requires X account) */}
          {effectiveXUserId && (
            <div className="flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
              <h6 className="text-nasun-white">Battalion NFT Allowlist</h6>
              <div className="flex items-center justify-between">
                {isBattalionLoading ? (
                  <Spinner size="sm" />
                ) : isBattalionRegistered ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-green-400 text-sm">&#10003; Registered</span>
                    {battalionStatus?.walletAddress && (
                      <span className="text-nasun-white/50 text-xs font-mono">
                        {shortenAddress(battalionStatus.walletAddress)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-nasun-white/50 text-sm">Not Registered</span>
                )}
                {!isBattalionLoading && !isBattalionRegistered && (
                  <Button onClick={() => navigate("/wave1/battalion-nft")} variant="filledOutlineC7" size="sm">
                    Join
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </OuterBox>

      {/* Wallet Mismatch Update Dialog */}
      <Dialog open={showMismatchDialog} onOpenChange={setShowMismatchDialog}>
        <DialogContent className="bg-gray-900 border-nasun-c5/30">
          <DialogHeader>
            <DialogTitle className="text-nasun-white">Update Allowlist Wallet</DialogTitle>
            <DialogDescription className="text-nasun-white/70">
              Your allowlist is registered with{" "}
              <span className="font-mono text-nasun-white/90">{genesisPassWallet && shortenAddress(genesisPassWallet)}</span>,
              but your linked wallet is{" "}
              <span className="font-mono text-nasun-white/90">{evmWalletAddress && shortenAddress(evmWalletAddress)}</span>.
              Would you like to update your allowlist to use the new wallet?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-4 mt-2">
            <Button
              variant="filledOutlineC7"
              size="default"
              onClick={() => setShowMismatchDialog(false)}
              disabled={isUpdating}
              className="w-full"
            >
              Keep Current
            </Button>
            <Button
              variant="filledOutlineC7"
              size="default"
              onClick={handleUpdateWallet}
              disabled={isUpdating}
              className="w-full"
            >
              {isUpdating ? "Updating..." : "Update Wallet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CompactNftStatus;
