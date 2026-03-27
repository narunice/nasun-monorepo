/**
 * DevCompactNftStatus Component
 *
 * Dev-only copy of CompactNftStatus with all hidden sections enabled.
 * Used by /dev/my-account for testing before production rollout.
 *
 * Sections enabled: Alliance NFT, Battalion NFT, Frontiers
 */

import { FC, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuth } from "@/features/auth";
import { useBattalionNftStatus } from "../../hooks/useBattalionNftStatus";
import { useGenesisPassStatus, invalidateGenesisPassStatus } from "../../hooks/useGenesisPassStatus";
import { registerGenesisPass, GenesisPassApiError } from "../../services/genesisPassApi";
import { OuterBox, Spinner } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { FcfsBadge, FreeMintBadge, GuaranteedBadge } from "./components/StatusBadges";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAllianceMintStatus } from "../../hooks/useAllianceMintStatus";
import { AllianceMintDialog } from "./components/AllianceMintDialog";

interface DevCompactNftStatusProps {
  className?: string;
}

const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

export const DevCompactNftStatus: FC<DevCompactNftStatusProps> = ({ className = "" }) => {
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
    isApplied: isGenesisPassApplied,
    status: genesisPassStatus,
    registeredWallet: genesisPassWallet,
    isLoading: isGenesisPassLoading,
    isConfigured: isGenesisPassConfigured,
    mintType: genesisPassMintType,
  } = useGenesisPassStatus(evmWalletAddress, cognitoToken);

  // Wallet mismatch detection
  const hasMismatch = isGenesisPassRegistered
    && evmWalletAddress
    && genesisPassWallet
    && genesisPassWallet.toLowerCase() !== evmWalletAddress.toLowerCase();

  // Alliance NFT Status
  const {
    isMinted: isAllianceMinted,
    isLoading: isAllianceLoading,
    data: allianceData,
    wallets: allianceWallets,
    isConfigured: isAllianceConfigured,
  } = useAllianceMintStatus(cognitoToken);

  const [showAllianceMintDialog, setShowAllianceMintDialog] = useState(false);

  const [showMismatchDialog, setShowMismatchDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (isJoining || !cognitoToken) return;
    try {
      setIsJoining(true);
      setJoinError(null);
      await registerGenesisPass(cognitoToken);
      toast.success("Successfully joined Genesis Pass Allowlist!");
      invalidateGenesisPassStatus();
    } catch (err: unknown) {
      console.error("[DevCompactNftStatus] Join error:", err);
      const isAlreadyRegistered = err instanceof GenesisPassApiError && err.statusCode === 409;
      if (isAlreadyRegistered) {
        toast.info("Already registered. Refreshing status...");
        invalidateGenesisPassStatus();
      } else {
        const message = err instanceof Error ? err.message : "Failed to join. Please try again.";
        setJoinError(message);
        toast.error(message);
      }
    } finally {
      setIsJoining(false);
    }
  };

  const handleUpdateWallet = async () => {
    if (isUpdating || !cognitoToken) return;

    try {
      setIsUpdating(true);
      await registerGenesisPass(cognitoToken);
      toast.success("Allowlist wallet address updated.");
      setShowMismatchDialog(false);
      invalidateGenesisPassStatus();
    } catch (err) {
      console.error("[DevCompactNftStatus] Wallet update error:", err);
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

          {/* Alliance NFT */}
          {isAllianceConfigured && (
            <div className="flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
              <h6 className="text-nasun-white">Alliance</h6>
              <div className="flex items-center justify-between">
                {isAllianceLoading ? (
                  <Spinner size="sm" />
                ) : isAllianceMinted ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-green-400 text-sm">&#10003; Minted</span>
                    {allianceData?.walletAddress && (
                      <span className="text-nasun-white/50 text-xs font-mono">
                        {shortenAddress(allianceData.walletAddress)}
                      </span>
                    )}
                  </div>
                ) : allianceWallets.length === 0 ? (
                  <span className="text-nasun-white/50 text-sm">Register a wallet first</span>
                ) : (
                  <p className="text-nasun-white/70 text-sm">
                    Use Nasun ecosystem to earn points
                  </p>
                )}
                {!isAllianceLoading && !isAllianceMinted && allianceWallets.length > 0 && (
                  <Button
                    onClick={() => setShowAllianceMintDialog(true)}
                    variant="filledOutlineC7"
                    size="sm"
                  >
                    Mint
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Genesis Pass */}
          {isGenesisPassConfigured && (
            <div className="flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
              <h6 className="text-nasun-white">Genesis Pass</h6>
              <div className="flex items-center justify-between">
                {isGenesisPassLoading ? (
                  <Spinner size="sm" />
                ) : isGenesisPassRegistered ? (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-green-400 text-sm">&#10003; Registered</span>
                      {genesisPassMintType === "FREE_MINT" && <FreeMintBadge />}
                      {genesisPassMintType === "GUARANTEED" && <GuaranteedBadge />}
                      {genesisPassMintType && genesisPassMintType !== "FREE_MINT" && genesisPassMintType !== "GUARANTEED" && <FcfsBadge />}
                    </div>
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
                ) : isGenesisPassApplied ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-yellow-400 text-sm">&#9679; Applied</span>
                    {genesisPassWallet && (
                      <span className="text-nasun-white/50 text-xs font-mono">
                        {shortenAddress(genesisPassWallet)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-nasun-white/50 text-sm">Not Applied</span>
                )}
                {!isGenesisPassLoading && !isGenesisPassRegistered && !isGenesisPassApplied && (
                  <Button onClick={() => navigate("/wave1/genesis-pass")} variant="filledOutlineC7" size="sm">
                    Join Allowlist
                  </Button>
                )}
              </div>
              {joinError && (
                <p className="text-red-400 text-xs">{joinError}</p>
              )}
              <a
                href="https://opensea.io/collection/nasun-genesis-pass/overview"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-nasun-white/70 hover:text-nasun-white text-sm self-end mt-1 transition-colors underline underline-offset-2"
              >
                Go to OpenSea
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>
          )}

          {/* Battalion NFT Allowlist */}
          <div className="flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
              <h6 className="text-nasun-white">Battalion</h6>
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
                    Join Allowlist
                  </Button>
                )}
              </div>
            </div>

          {/* Frontiers */}
          <div className="flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
            <h6 className="text-nasun-white">Frontiers</h6>
            <p className="text-nasun-white/70 text-sm">
              Details coming soon.
            </p>
            <Button variant="filledOutlineC7" size="sm" className="self-end mt-1" disabled>
              Coming Soon
            </Button>
          </div>
        </div>
      </OuterBox>

      {/* Alliance Mint Dialog */}
      {cognitoToken && (
        <AllianceMintDialog
          open={showAllianceMintDialog}
          onOpenChange={setShowAllianceMintDialog}
          wallets={allianceWallets}
          cognitoToken={cognitoToken}
        />
      )}

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

export default DevCompactNftStatus;
