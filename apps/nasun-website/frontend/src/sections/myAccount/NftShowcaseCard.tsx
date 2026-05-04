/**
 * NftShowcaseCard
 *
 * Image-prominent NFT display cards for the My Account dashboard.
 * Renders Genesis Pass (priority), Alliance, and Battalion as independent
 * OuterBox cards stacked vertically in a single column.
 */

import { FC, useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuth } from "@/features/auth";
import { useAllianceMintStatus } from "@/hooks/useAllianceMintStatus";
import { useGenesisPassStatus } from "@/hooks/useGenesisPassStatus";
import { useGenesisPassOwnership } from "@/hooks/useGenesisPassOwnership";
import { useNftDropRead } from "@/hooks/useNftDrop";
import { useEcosystemStatus } from "@/hooks/useEcosystemStatus";
import type { NftType } from "@/services/ecosystemApi";
import { OuterBox, Spinner } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { ButtonV3 } from "@/components/ui/button-v3";
import { ALLIANCE_PREVIEW_IMAGES, ALLIANCE_NAMES } from "@/constants/alliance";
import {
  NFT_EDITIONS,
  getEditionPosterUrl,
  STAGE_START_TIMES,
  MINT_CLOSE_TIME,
  calcTimeLeft,
} from "@/constants/nft-drop";

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

  // Prefer public mode (check lambda) when EVM wallet is available because it
  // returns eligibleStage + eligible + currentStage. Auth mode (register GET)
  // only returns registered + mintType, forcing unreliable client-side derivation.
  const {
    isRegistered: isGenesisPassRegistered,
    isLoading: isGenesisPassLoading,
    isConfigured: isGenesisPassConfigured,
    mintType: genesisPassMintType,
    eligibleStage: serverEligibleStage,
    registeredWallet: genesisPassWallet,
  } = useGenesisPassStatus(evmWalletAddress, evmWalletAddress ? null : cognitoToken);

  // Derive eligibleStage from mintType if server doesn't provide it.
  // Only use mintType for derivation; do NOT fall back to FCFS(3) just because
  // the user is registered, as that can falsely match currentStage during FCFS
  // and show "Mint now" for GTD/Free Mint users whose mintType is temporarily null.
  const MINT_TYPE_TO_STAGE: Record<string, number> = {
    FREE_MINT: 1,
    GUARANTEED: 2,
    FCFS: 3,
  };
  const eligibleStage: number | null =
    serverEligibleStage
    ?? (genesisPassMintType ? (MINT_TYPE_TO_STAGE[genesisPassMintType] ?? 3) : null);

  // Direct on-chain ownership check.
  // Fall back to the registered EVM wallet from allowlist when MetaMask is not connected.
  const effectiveEvmAddress = evmWalletAddress || genesisPassWallet?.toLowerCase() || undefined;
  const { hasMinted: hasGenesisPassNft, ownedEditionId } =
    useGenesisPassOwnership(effectiveEvmAddress);

  // On-chain current stage
  const { currentStage } = useNftDropRead();

  // justMinted query param from drop page redirect
  const [searchParams, setSearchParams] = useSearchParams();
  const justMinted = searchParams.get("justMinted") === "genesis-pass";
  const showMintedState = hasGenesisPassNft || justMinted;

  // Clean up justMinted once on-chain confirms (run once, not reactively)
  const cleanedUpRef = useRef(false);
  useEffect(() => {
    if (cleanedUpRef.current) return;
    if (justMinted && hasGenesisPassNft) {
      cleanedUpRef.current = true;
      const next = new URLSearchParams(searchParams);
      next.delete("justMinted");
      setSearchParams(next, { replace: true });
    }
  }, [justMinted, hasGenesisPassNft]); // eslint-disable-line react-hooks/exhaustive-deps

  const ownedEdition =
    ownedEditionId != null
      ? NFT_EDITIONS.find((e) => e.id === ownedEditionId)
      : undefined;

  // Countdown timer for Genesis Pass stage messaging
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const isMintClosed = now >= MINT_CLOSE_TIME.getTime();

  const ecosystem = useEcosystemStatus(cognitoToken, user?.identityId);

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
      ? ALLIANCE_PREVIEW_IMAGES[allianceData.imageIndex] ||
        ALLIANCE_PREVIEW_IMAGES[0]
      : ALLIANCE_PREVIEW_IMAGES[0];

  const genesisIsActive = !!ecosystem.getActivation("genesis-pass");

  // Genesis Pass stage messaging logic
  // FCFS users have mintType=null in DB (by design), so fall back to "FCFS"
  // when registered but no explicit mintType.
  const mintTypeLabel =
    genesisPassMintType === "FREE_MINT"
      ? "Free Mint"
      : genesisPassMintType === "GUARANTEED"
        ? "GTD"
        : genesisPassMintType === "FCFS"
          ? "FCFS"
          : isGenesisPassRegistered
            ? "FCFS"
            : null;

  // Determine if user's eligible stage is live, upcoming, or already ended
  const stageIsLive = eligibleStage != null && eligibleStage === currentStage;
  const stageUpcoming = eligibleStage != null && eligibleStage > currentStage;
  const stageEnded = eligibleStage != null && eligibleStage < currentStage;

  // Public stage is live
  const publicIsLive = currentStage >= 4;

  // Can the user mint right now?
  const canMintNow =
    (isGenesisPassRegistered && stageIsLive) || publicIsLive;

  // Countdown logic: different target and label depending on state
  let countdownTarget: Date | null = null;
  let countdownLabel = "";

  if (canMintNow) {
    // Minting is live: show closing countdown
    if (publicIsLive) {
      countdownTarget = MINT_CLOSE_TIME;
      countdownLabel = "Your mint closes in";
    } else {
      // User's allowlist stage is live, closes when next stage starts
      countdownTarget = STAGE_START_TIMES[currentStage + 1] ?? MINT_CLOSE_TIME;
      countdownLabel = "Your mint closes in";
    }
  } else {
    // Minting not yet available: show opening countdown
    countdownTarget =
      stageUpcoming && STAGE_START_TIMES[eligibleStage!]
        ? STAGE_START_TIMES[eligibleStage!]
        : STAGE_START_TIMES[4];
    countdownLabel = "Your mint opens in";
  }

  const timeLeft = countdownTarget ? calcTimeLeft(countdownTarget, now) : null;

  return (
    <div className={`flex flex-col gap-4 lg:gap-6 ${className}`}>
      {/* === Genesis Pass (priority during drop) === */}
      {isGenesisPassConfigured && (
        <OuterBox color="w2" padding="sm" className="animate-fade-slide-up">
          <div className="flex flex-col gap-2">
            <h6 className="text-nasun-white font-medium uppercase">
              GENESIS PASS
            </h6>
            <div
              className={`relative rounded-sm overflow-hidden aspect-square transition-all flex items-center justify-center ${
                showMintedState
                  ? "bg-slate-800"
                  : genesisIsActive
                    ? "bg-slate-600"
                    : "bg-slate-700"
              }`}
            >
              <span className="absolute top-3 left-3 text-sm font-bold px-2 py-0.5 rounded-full z-10 border border-green-500 text-green-400 bg-black/50">
                Boost x2
              </span>

              {isGenesisPassLoading ? (
                <Spinner />
              ) : showMintedState ? (
                /* Minted: poster (color when active, grayscale when not) */
                <>
                  {ownedEdition && (
                    <img
                      src={getEditionPosterUrl(ownedEdition.name)}
                      alt={ownedEdition.name}
                      className={`absolute inset-0 w-full h-full object-cover transition-all ${
                        genesisIsActive ? "" : "grayscale brightness-50"
                      }`}
                      loading="lazy"
                    />
                  )}
                  {genesisIsActive ? (
                    <>
                      {ownedEdition && (
                        <div className="absolute bottom-[10%] inset-x-0 flex justify-center pointer-events-none">
                          <span className="text-white text-lg font-semibold uppercase tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                            {ownedEdition.name}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="relative z-10 flex flex-col items-center gap-1 px-4 text-center">
                      {justMinted && !hasGenesisPassNft ? (
                        <h6 className="text-nasun-white animate-pulse font-semibold">
                          Confirming on chain...
                        </h6>
                      ) : (
                        <h6 className="text-emerald-400 font-bold drop-shadow-[0_2px_8px_rgba(52,211,153,0.4)]">
                          Your{" "}
                          <span className="text-nasun-white">
                            {ownedEdition?.name ?? "Genesis Pass"}
                          </span>{" "}
                          is ready.
                        </h6>
                      )}
                      {!isMintClosed && (
                        <p className="text-nasun-white/70 text-sm mt-1">
                          Activate after the drop ends.
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : isMintClosed ? (
                /* Mint period ended: activate guidance for secondary market */
                <div className="flex flex-col items-center gap-2 px-4 text-center">
                  <h6 className="text-nasun-white/70 font-medium">
                    Activate your Genesis Pass to earn ecosystem points.
                  </h6>
                </div>
              ) : canMintNow ? (
                /* User can mint right now: big "Mint now." + closing countdown */
                <div className="flex flex-col items-center gap-1 px-4 pt-4 text-center">
                  <h6 className="text-emerald-400 font-bold animate-pulse drop-shadow-[0_2px_8px_rgba(52,211,153,0.4)]">
                    Mint now.
                  </h6>
                  {timeLeft && !timeLeft.isExpired && (
                    <CountdownDisplay label={countdownLabel} timeLeft={timeLeft} />
                  )}
                </div>
              ) : isGenesisPassRegistered && mintTypeLabel && stageEnded ? (
                /* User's allowlist stage has ended, guide to public */
                <div className="flex flex-col items-center gap-1 px-4 pt-6 text-center">
                  <h6 className="font-bold">
                    <span className="text-nasun-white/70">{mintTypeLabel} stage ended.</span>
                    <br />
                    <span className="text-amber-400">You can mint in public stage.</span>
                  </h6>
                  {timeLeft && !timeLeft.isExpired && (
                    <CountdownDisplay label={countdownLabel} timeLeft={timeLeft} />
                  )}
                </div>
              ) : isGenesisPassRegistered && mintTypeLabel ? (
                /* In allowlist, stage upcoming */
                <div className="flex flex-col items-center gap-1 px-4 pt-6 text-center">
                  <h6 className="font-bold">
                    <span className="text-nasun-white">You are in</span>
                    <br />
                    <span className="text-amber-400">{mintTypeLabel} allowlist.</span>
                  </h6>
                  {timeLeft && !timeLeft.isExpired && (
                    <CountdownDisplay label={countdownLabel} timeLeft={timeLeft} />
                  )}
                </div>
              ) : (
                /* Not in allowlist, public not yet */
                <div className="flex flex-col items-center gap-1 px-4 pt-6 text-center">
                  <h6 className="font-bold">
                    <span className="text-nasun-white">You can mint in</span>
                    <br />
                    <span className="text-amber-400">public stage.</span>
                  </h6>
                  {timeLeft && !timeLeft.isExpired && (
                    <CountdownDisplay label={countdownLabel} timeLeft={timeLeft} />
                  )}
                </div>
              )}
            </div>
            {/* Actions */}
            {showMintedState ? (
              <div className="flex items-center justify-between mt-1">
                {genesisIsActive ? (
                  <span className="text-green-400 text-sm">Activated</span>
                ) : (
                  <span className="text-nasun-white/70 text-sm">
                    {isMintClosed ? "Ready to activate" : "Minted"}
                  </span>
                )}
                <div className="flex gap-2">
                  {!genesisIsActive && ecosystem.isConfigured && (
                    <Button
                      onClick={() => handleActivate("genesis-pass")}
                      variant="filledOutlineC7"
                      size="sm"
                      disabled={!isMintClosed || ecosystem.isActivating}
                    >
                      {ecosystem.isActivating ? "..." : "Activate"}
                    </Button>
                  )}
                  {genesisIsActive && (
                    <ThreeDotMenu
                      show={showGenesisMenu}
                      onToggle={() => setShowGenesisMenu((v) => !v)}
                      onClose={() => setShowGenesisMenu(false)}
                      onAction={() => {
                        setShowGenesisMenu(false);
                        handleDeactivate("genesis-pass");
                      }}
                      isLoading={ecosystem.isActivating}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mt-1">
                <ButtonV3
                  onClick={() => window.open("https://opensea.io/collection/0x561d4a687e9d13925ad7bef0209c9ecaec9858e1", "_blank")}
                  variant="nw2"
                  size="sm"
                  outline
                  className="w-full"
                >
                  View on OpenSea
                </ButtonV3>
              </div>
            )}
          </div>
        </OuterBox>
      )}

      {/* === Alliance === */}
      {isAllianceConfigured && (
        <OuterBox
          color="w2"
          padding="sm"
          className="animate-fade-slide-up relative z-10"
        >
          <div className="flex flex-col gap-2">
            <h6 className="text-nasun-white font-medium uppercase">ALLIANCE</h6>
            <div className="relative rounded-sm overflow-hidden aspect-square">
              {isAllianceLoading ? (
                <div className="w-full h-full bg-slate-700 flex items-center justify-center">
                  <Spinner />
                </div>
              ) : !isAllianceMinted ? (
                <div className="w-full h-full bg-slate-700 flex items-center justify-center">
                  <span className="absolute top-3 left-3 text-sm font-bold px-2 py-0.5 rounded-full border border-green-500 text-green-400 bg-black/50">
                    x1
                  </span>
                  <span className="text-nasun-white/80 text-sm font-medium text-center px-4">
                    Mint your Alliance NFT
                  </span>
                </div>
              ) : (
                <>
                  <img
                    src={allianceImgSrc}
                    alt="Alliance NFT"
                    className={`w-full h-full object-cover transition-all ${
                      !allianceIsActive ? "brightness-50 grayscale" : ""
                    }`}
                    loading="lazy"
                  />
                  <span className="absolute top-3 left-3 text-sm font-bold px-2 py-0.5 rounded-full border border-green-500 text-green-400 bg-black/50">
                    x1
                  </span>
                  {/* Character name overlay at belly/waist area */}
                  {allianceData && (
                    <div className="absolute bottom-[10%] inset-x-0 flex justify-center pointer-events-none">
                      <span className="text-white text-lg font-semibold uppercase tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        {ALLIANCE_NAMES[allianceData.imageIndex] ?? ""}
                      </span>
                    </div>
                  )}
                  {!allianceIsActive && (
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
                <span className="text-nasun-white/80 text-sm">Loading...</span>
              ) : !isAllianceMinted ? (
                <span className="text-nasun-white/80 text-sm">Not Minted</span>
              ) : allianceIsActive ? (
                <span className="text-green-400 text-sm">Activated</span>
              ) : (
                <span className="text-nasun-white/70 text-sm">Minted</span>
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
                {isAllianceMinted &&
                  !allianceIsActive &&
                  ecosystem.isConfigured && (
                    <Button
                      onClick={() => handleActivate("alliance")}
                      variant="filledOutlineC7"
                      size="sm"
                      disabled={ecosystem.isActivating}
                    >
                      {ecosystem.isActivating ? "..." : "Activate"}
                    </Button>
                  )}
                {allianceIsActive && (
                  <ThreeDotMenu
                    show={showAllianceMenu}
                    onToggle={() => setShowAllianceMenu((v) => !v)}
                    onClose={() => setShowAllianceMenu(false)}
                    onAction={() => {
                      setShowAllianceMenu(false);
                      handleDeactivate("alliance");
                    }}
                    isLoading={ecosystem.isActivating}
                  />
                )}
              </div>
            </div>
          </div>
        </OuterBox>
      )}

      {/* === Battalion === */}
      <OuterBox color="w2" padding="sm" className="animate-fade-slide-up">
        <h6 className="text-nasun-white font-medium uppercase">BATTALION</h6>
        <p className="text-nasun-white/80 text-sm mt-1">Coming Soon</p>
      </OuterBox>
    </div>
  );
};

// Countdown display for Genesis Pass stage timing
function CountdownDisplay({
  label,
  timeLeft,
}: {
  label: string;
  timeLeft: { days: number; hours: number; minutes: number; seconds: number };
}) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const segments = [
    ...(timeLeft.days > 0
      ? [{ value: String(timeLeft.days), unit: "D" }]
      : []),
    { value: pad(timeLeft.hours), unit: "H" },
    { value: pad(timeLeft.minutes), unit: "M" },
    { value: pad(timeLeft.seconds), unit: "S" },
  ];

  return (
    <div className="flex flex-col items-center mt-4 gap-2">
      <span className="text-nasun-white/80 text-sm uppercase tracking-widest">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        {segments.map((seg, i) => (
          <div key={seg.unit} className="flex items-center gap-1.5">
            <div className="flex flex-col items-center">
              <span
                className="text-nasun-white text-2xl md:text-3xl font-bold leading-none"
                style={{
                  fontVariantNumeric: "tabular-nums",
                  minWidth: "2ch",
                  textAlign: "center",
                  display: "inline-block",
                }}
              >
                {seg.value}
              </span>
              <span className="text-nasun-white/80 text-sm uppercase tracking-widest mt-1">
                {seg.unit}
              </span>
            </div>
            {i < segments.length - 1 && (
              <span className="text-nasun-white/80 text-xl md:text-2xl font-light -mt-2.5">
                :
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Inline three-dot deactivate menu (used for Alliance and Genesis Pass)
function ThreeDotMenu({
  show,
  onToggle,
  onClose,
  onAction,
  isLoading,
}: {
  show: boolean;
  onToggle: () => void;
  onClose: () => void;
  onAction: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="w-7 h-7 rounded-full flex items-center justify-center text-nasun-white/80 hover:text-nasun-white hover:bg-nasun-white/10 transition-colors"
      >
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
            <button
              onClick={onAction}
              disabled={isLoading}
              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {isLoading ? "Deactivating..." : "Deactivate"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
