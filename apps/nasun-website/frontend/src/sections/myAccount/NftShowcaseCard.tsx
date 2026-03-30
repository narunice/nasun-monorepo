/**
 * NftShowcaseCard
 *
 * Image-prominent NFT display cards for the My Account dashboard.
 * Renders Alliance, Genesis Pass, and Battalion as independent OuterBox cards
 * stacked vertically in a single column.
 */

import { FC, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuth } from "@/features/auth";
import { useAllianceMintStatus } from "@/hooks/useAllianceMintStatus";
import { useGenesisPassStatus } from "@/hooks/useGenesisPassStatus";
import { useEcosystemStatus } from "@/hooks/useEcosystemStatus";
import type { NftType } from "@/services/ecosystemApi";
import { OuterBox, Spinner } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { ALLIANCE_PREVIEW_IMAGES } from "@/constants/alliance";

interface NftShowcaseCardProps {
  className?: string;
}

export const NftShowcaseCard: FC<NftShowcaseCardProps> = ({
  className = "",
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const cognitoToken = user?.cognitoToken;

  const evmWalletAddress =
    user?.linkedAccounts?.metamask?.walletAddress?.toLowerCase() ||
    (user?.provider === "MetaMask"
      ? user.walletAddress?.toLowerCase()
      : undefined);

  const {
    isMinted: isAllianceMinted,
    isLoading: isAllianceLoading,
    data: allianceData,
    isConfigured: isAllianceConfigured,
  } = useAllianceMintStatus(cognitoToken);

  const {
    isRegistered: isGenesisPassRegistered,
    isApplied: isGenesisPassApplied,
    isLoading: isGenesisPassLoading,
    isConfigured: isGenesisPassConfigured,
  } = useGenesisPassStatus(evmWalletAddress, cognitoToken);

  const ecosystem = useEcosystemStatus(cognitoToken);

  const [showAllianceMenu, setShowAllianceMenu] = useState(false);
  const [showGenesisMenu, setShowGenesisMenu] = useState(false);

  const handleActivate = async (nftType: NftType) => {
    try {
      await ecosystem.activate(nftType);
      toast.success(
        `${nftType === "genesis-pass" ? "Genesis Pass" : nftType.charAt(0).toUpperCase() + nftType.slice(1)} activated!`,
      );
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

  const allianceIsActive = !!ecosystem.getActivation("alliance");
  const allianceImgSrc =
    isAllianceMinted && allianceData
      ? ALLIANCE_PREVIEW_IMAGES[allianceData.imageIndex] || ALLIANCE_PREVIEW_IMAGES[0]
      : ALLIANCE_PREVIEW_IMAGES[0];

  const genesisIsActive = !!ecosystem.getActivation("genesis-pass");

  return (
    <div className={`flex flex-col gap-4 lg:gap-6 ${className}`}>

      {/* === Alliance === */}
      {isAllianceConfigured && (
        <OuterBox color="c5" padding="sm" className="animate-fade-slide-up relative z-10">
          <div className="flex flex-col gap-2">
            <h6 className="text-nasun-white font-medium uppercase">ALLIANCE</h6>
            <div className="relative rounded-sm overflow-hidden aspect-square">
              {isAllianceLoading ? (
                <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <>
                  <img
                    src={allianceImgSrc}
                    alt="Alliance NFT"
                    className={`w-full h-full object-cover transition-all ${
                      !isAllianceMinted
                        ? "brightness-[0.3]"
                        : !allianceIsActive
                          ? "brightness-50 grayscale"
                          : ""
                    }`}
                    loading="lazy"
                  />
                  <span className="absolute top-3 left-3 text-sm font-bold px-2 py-0.5 rounded-full border border-green-500 text-green-400 bg-black/50">
                    x1
                  </span>
                  {!isAllianceMinted && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-nasun-white/80 text-sm font-medium text-center px-4">
                        Mint your Alliance NFT
                      </span>
                    </div>
                  )}
                  {isAllianceMinted && !allianceIsActive && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-nasun-white/90 text-sm font-semibold bg-black/40 px-3 py-1 rounded-full">
                        Activate to earn points
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center justify-between">
              {isAllianceLoading ? (
                <span className="text-nasun-white/50 text-sm">Loading...</span>
              ) : !isAllianceMinted ? (
                <span className="text-nasun-white/50 text-sm">Not Minted</span>
              ) : allianceIsActive ? (
                <span className="text-green-400 text-sm">Active</span>
              ) : (
                <span className="text-nasun-white/70 text-sm">Minted</span>
              )}
              <div className="flex gap-2">
                {!isAllianceLoading && !isAllianceMinted && (
                  <Button onClick={() => navigate("/wave1/alliance-nft")} variant="filledOutlineC7" size="sm">
                    Mint
                  </Button>
                )}
                {isAllianceMinted && !allianceIsActive && ecosystem.isConfigured && (
                  <Button onClick={() => handleActivate("alliance")} variant="filledOutlineC7" size="sm" disabled={ecosystem.isActivating}>
                    {ecosystem.isActivating ? "..." : "Activate"}
                  </Button>
                )}
                {allianceIsActive && (
                  <ThreeDotMenu show={showAllianceMenu} onToggle={() => setShowAllianceMenu((v) => !v)} onClose={() => setShowAllianceMenu(false)} onAction={() => { setShowAllianceMenu(false); handleDeactivate("alliance"); }} isLoading={ecosystem.isActivating} />
                )}
              </div>
            </div>
          </div>
        </OuterBox>
      )}

      {/* === Genesis Pass === */}
      {isGenesisPassConfigured && (
        <OuterBox color="c5" padding="sm" className="animate-fade-slide-up">
          <div className="flex flex-col gap-2">
            <h6 className="text-nasun-white font-medium uppercase">GENESIS PASS</h6>
            <div className={`relative rounded-sm overflow-hidden aspect-[2/1] transition-all ${genesisIsActive ? "bg-gray-700" : "bg-gray-800"}`}>
              <span className="absolute top-3 left-3 text-sm font-bold px-2 py-0.5 rounded-full z-10 border border-green-500 text-green-400 bg-black/50">
                Boost x2
              </span>
              {!genesisIsActive && <div className="absolute inset-0 bg-black/30" />}
            </div>
            <div className="flex items-center justify-between">
              {isGenesisPassLoading ? (
                <Spinner size="sm" />
              ) : genesisIsActive ? (
                <span className="text-green-400 text-sm">Active</span>
              ) : isGenesisPassRegistered ? (
                <span className="text-nasun-white/70 text-sm">Registered</span>
              ) : isGenesisPassApplied ? (
                <span className="text-yellow-400 text-sm">Applied</span>
              ) : (
                <span className="text-nasun-white/50 text-sm">Not Applied</span>
              )}
              <div className="flex gap-2">
                {!isGenesisPassLoading && !isGenesisPassRegistered && !isGenesisPassApplied && (
                  <Button onClick={() => navigate("/wave1/genesis-pass")} variant="filledOutlineC7" size="sm">
                    Join Allowlist
                  </Button>
                )}
                {isGenesisPassRegistered && !genesisIsActive && ecosystem.isConfigured && (
                  <Button onClick={() => handleActivate("genesis-pass")} variant="filledOutlineC7" size="sm" disabled={ecosystem.isActivating}>
                    {ecosystem.isActivating ? "..." : "Activate"}
                  </Button>
                )}
                {genesisIsActive && (
                  <ThreeDotMenu show={showGenesisMenu} onToggle={() => setShowGenesisMenu((v) => !v)} onClose={() => setShowGenesisMenu(false)} onAction={() => { setShowGenesisMenu(false); handleDeactivate("genesis-pass"); }} isLoading={ecosystem.isActivating} />
                )}
              </div>
            </div>
            <a
              href="https://opensea.io/collection/nasun-genesis-pass/overview"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-nasun-white/70 hover:text-nasun-white text-sm self-end transition-colors underline underline-offset-2"
            >
              Go to OpenSea
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          </div>
        </OuterBox>
      )}

      {/* === Battalion === */}
      <OuterBox color="c5" padding="sm" className="animate-fade-slide-up">
        <h6 className="text-nasun-white font-medium uppercase">BATTALION</h6>
        <p className="text-nasun-white/40 text-sm mt-1">Coming Soon</p>
      </OuterBox>

    </div>
  );
};

// Inline three-dot deactivate menu (used for Alliance and Genesis Pass)
function ThreeDotMenu({ show, onToggle, onClose, onAction, isLoading }: {
  show: boolean; onToggle: () => void; onClose: () => void; onAction: () => void; isLoading: boolean;
}) {
  return (
    <div className="relative">
      <button onClick={onToggle} className="w-7 h-7 rounded-full flex items-center justify-center text-nasun-white/50 hover:text-nasun-white hover:bg-nasun-white/10 transition-colors">
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>
      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div className="absolute right-0 top-8 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[140px]">
            <button onClick={onAction} disabled={isLoading} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
              {isLoading ? "Deactivating..." : "Deactivate"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
