/**
 * CompactNftStatus Component
 *
 * Event participation status cards in the My Account Bento Grid.
 * Shows: Genesis Pass Allowlist, Leaderboard Event, Battalion NFT Allowlist.
 *
 * NOTE: Frontiers Whitelist is hidden during Battalion NFT campaign.
 * Genesis Pass Allowlist is now visible with Free Mint badge for raffle winners.
 */

import { FC, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuth } from "@/features/auth";
import { useBattalionNftStatus } from "../../hooks/useBattalionNftStatus";
import { useGenesisPassStatus, invalidateGenesisPassStatus } from "../../hooks/useGenesisPassStatus";
import { registerGenesisPass, GenesisPassApiError } from "../../services/genesisPassApi";
import { OuterBox, Spinner } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { FcfsBadge, FreeMintBadge, GuaranteedBadge, MintedBadge } from "./components/StatusBadges";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAllianceMintStatus } from "../../hooks/useAllianceMintStatus";

import { useGenesisPassOwnership } from "@/hooks/useGenesisPassOwnership";
import { useEcosystemStatus } from "../../hooks/useEcosystemStatus";
import type { NftType } from "../../services/ecosystemApi";
import { ALLIANCE_IMAGES } from "@/constants/alliance";

interface CompactNftStatusProps {
  className?: string;
  /** When true, show Alliance NFT, Battalion NFT, and Frontiers sections (hidden in production). */
  showAllSections?: boolean;
}

const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

export const CompactNftStatus: FC<CompactNftStatusProps> = ({ className = "", showAllSections = false }) => {
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
    isConfigured: isAllianceConfigured,
  } = useAllianceMintStatus(cognitoToken);

  // Genesis Pass mint status (direct on-chain balanceOfBatch)
  const { hasMinted: hasGenesisPassNft } = useGenesisPassOwnership(evmWalletAddress);

  // justMinted query param (redirect from drop page after successful mint)
  const [searchParams, setSearchParams] = useSearchParams();
  const justMinted = searchParams.get("justMinted") === "genesis-pass";
  const showMintedState = hasGenesisPassNft || justMinted;

  // Clean up justMinted param once on-chain ownership is confirmed
  useEffect(() => {
    if (justMinted && hasGenesisPassNft) {
      searchParams.delete("justMinted");
      setSearchParams(searchParams, { replace: true });
    }
  }, [justMinted, hasGenesisPassNft]);

  const [showAllianceMenu, setShowAllianceMenu] = useState(false);
  const [showGenesisMenu, setShowGenesisMenu] = useState(false);
  const [showBattalionMenu, setShowBattalionMenu] = useState(false);

  // Ecosystem activation (only when showAllSections is true)
  const ecosystem = useEcosystemStatus(showAllSections ? cognitoToken : undefined);

  const handleActivate = async (nftType: NftType) => {
    try {
      await ecosystem.activate(nftType);
      toast.success(`${nftType === "genesis-pass" ? "Genesis Pass" : nftType.charAt(0).toUpperCase() + nftType.slice(1)} activated!`);
    } catch (err) {
      toast.error((err as Error).message || "Activation failed");
    }
  };

  const handleDeactivate = async (nftType: NftType) => {
    try {
      await ecosystem.deactivate(nftType);
      toast.info("Deactivated");
    } catch (err) {
      toast.error((err as Error).message || "Deactivation failed");
    }
  };

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
      console.error("[CompactNftStatus] Join error:", err);
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
          {/* Leaderboard Event CTA (requires X account) */}
          {effectiveXUserId && (
            <div className="flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
              <h6 className="text-nasun-white">Leaderboard Event</h6>
              <p className="text-nasun-white/70 text-base">
                You're in! Share content about Nasun and get recognized.
              </p>
              <Button onClick={() => navigate("/wave1/leaderboard-guide")} variant="filledOutlineC7" size="sm" className="self-end mt-1">
                Learn More
              </Button>
            </div>
          )}

          {/* Alliance NFT */}
          {showAllSections && isAllianceConfigured && (
            <div className="relative flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
              {/* NFT image badge (overlapping top-right) */}
              <div className="absolute -top-3 -right-3">
                <div className="relative">
                  {isAllianceMinted && allianceData ? (
                    <img
                      src={ALLIANCE_IMAGES[allianceData.imageIndex] || ALLIANCE_IMAGES[0]}
                      alt="Alliance NFT"
                      className={`w-10 h-10 rounded-full object-cover border-2 ${
                        ecosystem.getActivation("alliance")
                          ? "border-green-500/50 brightness-100"
                          : "border-gray-600 brightness-50"
                      }`}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-600 border-2 border-gray-500" />
                  )}
                  {ecosystem.getActivation("alliance") && (
                    <div className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-gray-800" />
                  )}
                </div>
              </div>
              <div>
                <h6 className="text-nasun-white">Alliance</h6>
              </div>
              <div className="flex items-center justify-between">
                {isAllianceLoading ? (
                  <Spinner size="sm" />
                ) : isAllianceMinted ? (
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-sm ${ecosystem.getActivation("alliance") ? "text-green-400" : "text-nasun-white/70"}`}>
                      {ecosystem.getActivation("alliance") ? "Activated" : "Minted"}
                    </span>
                    {allianceData?.walletAddress && (
                      <span className="text-nasun-white/50 text-sm font-mono">
                        {shortenAddress(allianceData.walletAddress)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-nasun-white/50 text-sm">Not Minted</span>
                )}
                <div className="flex gap-2">
                  {!isAllianceLoading && !isAllianceMinted && (
                    <Button
                      onClick={() => navigate("/wave1/alliance-nft")}
                      variant="filledOutlineC7"
                      size="sm"
                    >
                      Mint
                    </Button>
                  )}
                  {isAllianceMinted && !ecosystem.getActivation("alliance") && ecosystem.isConfigured && (
                    <Button
                      onClick={() => handleActivate("alliance")}
                      variant="filledOutlineC7"
                      size="sm"
                      disabled={ecosystem.isActivating}
                    >
                      {ecosystem.isActivating ? "..." : "Activate"}
                    </Button>
                  )}
                  {ecosystem.getActivation("alliance") && (
                    <div className="relative">
                      <button
                        onClick={() => setShowAllianceMenu((v) => !v)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-nasun-white/50 hover:text-nasun-white hover:bg-nasun-white/10 transition-colors"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                          <circle cx="8" cy="3" r="1.5" />
                          <circle cx="8" cy="8" r="1.5" />
                          <circle cx="8" cy="13" r="1.5" />
                        </svg>
                      </button>
                      {showAllianceMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowAllianceMenu(false)} />
                          <div className="absolute right-0 top-8 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[140px]">
                            <button
                              onClick={() => {
                                setShowAllianceMenu(false);
                                handleDeactivate("alliance");
                              }}
                              disabled={ecosystem.isActivating}
                              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            >
                              {ecosystem.isActivating ? "Deactivating..." : "Deactivate"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Genesis Pass Allowlist */}
          {isGenesisPassConfigured && (
            <div className="flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
              <div className="flex items-center justify-between">
                <h6 className="text-nasun-white">Genesis Pass</h6>
                {showAllSections && ecosystem.getActivation("genesis-pass") && (
                  <span className="text-sm font-semibold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">
                    ACTIVATED
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                {isGenesisPassLoading ? (
                  <Spinner size="sm" />
                ) : showMintedState ? (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <MintedBadge />
                      {genesisPassMintType === "FREE_MINT" && <FreeMintBadge />}
                      {genesisPassMintType === "GUARANTEED" && <GuaranteedBadge />}
                      {genesisPassMintType && genesisPassMintType !== "FREE_MINT" && genesisPassMintType !== "GUARANTEED" && <FcfsBadge />}
                    </div>
                    {(genesisPassWallet || evmWalletAddress) && (
                      <span className="text-nasun-white/50 text-sm font-mono">
                        {shortenAddress(genesisPassWallet || evmWalletAddress!)}
                      </span>
                    )}
                  </div>
                ) : isGenesisPassRegistered ? (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-green-400 text-sm">&#10003; Registered</span>
                      {genesisPassMintType === "FREE_MINT" && <FreeMintBadge />}
                      {genesisPassMintType === "GUARANTEED" && <GuaranteedBadge />}
                      {genesisPassMintType && genesisPassMintType !== "FREE_MINT" && genesisPassMintType !== "GUARANTEED" && <FcfsBadge />}
                    </div>
                    {genesisPassWallet && (
                      <span className="text-nasun-white/50 text-sm font-mono">
                        {shortenAddress(genesisPassWallet)}
                      </span>
                    )}
                    {hasMismatch && (
                      <button
                        onClick={() => setShowMismatchDialog(true)}
                        className="text-yellow-400 text-sm text-left hover:underline"
                      >
                        Wallet mismatch - click to update
                      </button>
                    )}
                  </div>
                ) : isGenesisPassApplied ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-yellow-400 text-sm">&#9679; Applied</span>
                    {genesisPassWallet && (
                      <span className="text-nasun-white/50 text-sm font-mono">
                        {shortenAddress(genesisPassWallet)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-nasun-white/50 text-sm">Not Applied</span>
                )}
                {!isGenesisPassLoading && !showMintedState && !isGenesisPassRegistered && !isGenesisPassApplied && (
                  <Button onClick={() => navigate("/wave1/genesis-pass")} variant="filledOutlineC7" size="sm">
                    Join Allowlist
                  </Button>
                )}
              </div>
              {joinError && (
                <p className="text-red-400 text-sm">{joinError}</p>
              )}
              {/* Genesis Pass Activate/Deactivate (dev only) */}
              {showAllSections && (isGenesisPassRegistered || showMintedState) && ecosystem.isConfigured && (
                <div className="flex gap-2 self-end">
                  {!ecosystem.getActivation("genesis-pass") && (
                    <Button
                      onClick={() => handleActivate("genesis-pass")}
                      variant="filledOutlineC7"
                      size="sm"
                      disabled={ecosystem.isActivating}
                    >
                      {ecosystem.isActivating ? "..." : "Activate"}
                    </Button>
                  )}
                  {ecosystem.getActivation("genesis-pass") && (
                    <div className="relative">
                      <button
                        onClick={() => setShowGenesisMenu((v) => !v)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-nasun-white/50 hover:text-nasun-white hover:bg-nasun-white/10 transition-colors"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                          <circle cx="8" cy="3" r="1.5" />
                          <circle cx="8" cy="8" r="1.5" />
                          <circle cx="8" cy="13" r="1.5" />
                        </svg>
                      </button>
                      {showGenesisMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowGenesisMenu(false)} />
                          <div className="absolute right-0 top-8 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[140px]">
                            <button
                              onClick={() => {
                                setShowGenesisMenu(false);
                                handleDeactivate("genesis-pass");
                              }}
                              disabled={ecosystem.isActivating}
                              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            >
                              {ecosystem.isActivating ? "Deactivating..." : "Deactivate"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              <a
                href="/wave1/genesis-pass-drop"
                className="inline-flex items-center gap-1.5 text-nasun-white/70 hover:text-nasun-white text-sm self-end mt-1 transition-colors underline underline-offset-2"
              >
                Go to Genesis Pass Drop
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>
          )}

          {/* Battalion NFT Allowlist */}
          {showAllSections && (
            <div className="flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
              <h6 className="text-nasun-white">Battalion</h6>
              <div className="flex items-center justify-between">
                {isBattalionLoading ? (
                  <Spinner size="sm" />
                ) : isBattalionRegistered ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-green-400 text-sm">&#10003; Registered</span>
                    {battalionStatus?.walletAddress && (
                      <span className="text-nasun-white/50 text-sm font-mono">
                        {shortenAddress(battalionStatus.walletAddress)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-nasun-white/50 text-sm">Not Registered</span>
                )}
                <div className="flex gap-2">
                  {!isBattalionLoading && !isBattalionRegistered && (
                    <Button onClick={() => navigate("/wave1/battalion-nft")} variant="filledOutlineC7" size="sm">
                      Join Allowlist
                    </Button>
                  )}
                  {isBattalionRegistered && !ecosystem.getActivation("battalion") && ecosystem.isConfigured && (
                    <Button
                      onClick={() => handleActivate("battalion")}
                      variant="filledOutlineC7"
                      size="sm"
                      disabled={ecosystem.isActivating}
                    >
                      {ecosystem.isActivating ? "..." : "Activate"}
                    </Button>
                  )}
                  {ecosystem.getActivation("battalion") && (
                    <div className="relative">
                      <button
                        onClick={() => setShowBattalionMenu((v) => !v)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-nasun-white/50 hover:text-nasun-white hover:bg-nasun-white/10 transition-colors"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                          <circle cx="8" cy="3" r="1.5" />
                          <circle cx="8" cy="8" r="1.5" />
                          <circle cx="8" cy="13" r="1.5" />
                        </svg>
                      </button>
                      {showBattalionMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowBattalionMenu(false)} />
                          <div className="absolute right-0 top-8 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[140px]">
                            <button
                              onClick={() => {
                                setShowBattalionMenu(false);
                                handleDeactivate("battalion");
                              }}
                              disabled={ecosystem.isActivating}
                              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            >
                              {ecosystem.isActivating ? "Deactivating..." : "Deactivate"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Frontiers */}
          {showAllSections && (
            <div className="flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
              <h6 className="text-nasun-white">Frontiers</h6>
              <p className="text-nasun-white/70 text-base">
                Details coming soon.
              </p>
              <Button variant="filledOutlineC7" size="sm" className="self-end mt-1" disabled>
                Coming Soon
              </Button>
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
