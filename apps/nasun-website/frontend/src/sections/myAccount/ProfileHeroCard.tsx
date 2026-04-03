/**
 * ProfileHeroCard Component
 *
 * Hero card for the My Account dashboard.
 * Shows: Avatar, username, activity points summary (absorbed from PointsCard),
 * V3 leaderboard rank, and placeholder for ecosystem score (Step 5D).
 *
 * Connected Accounts management has been extracted to ConnectedAccountsCard.
 */

import { FC, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/features/auth";
import { OuterBox, Spinner } from "@/components/ui";
import { GenesisPassBadge } from "./components/StatusBadges";
import { ConnectedAccountsCard } from "./ConnectedAccountsCard";
import { DailyMissionsCard } from "./DailyMissionsCard";
import { HealthStatusBar } from "./HealthStatusBar";
import { useEcosystemScore } from "@/hooks/useEcosystemScore";
import { useEcosystemStatus } from "@/hooks/useEcosystemStatus";
import { AirdropRegistrationCard } from "./AirdropRegistrationCard";


// ---- Category display config ----

// ---- Score composition bar: base + bonus categories ----

const CATEGORY_COLORS: Record<string, string> = {
  base: "bg-cyan-500",
  governance: "bg-purple-500",
  "referral-bonus": "bg-sky-500",
  "ecosystem-bonus-earlybird": "bg-yellow-500",
  "ecosystem-bonus-pado": "bg-lime-500",
  "ecosystem-bonus-game": "bg-orange-500",
  "ecosystem-bonus-airdrop": "bg-fuchsia-500",
};

const CATEGORY_LABELS: Record<string, string> = {
  base: "Base Score",
  governance: "Governance",
  "referral-bonus": "Referral",
  "ecosystem-bonus-earlybird": "Early Bird",
  "ecosystem-bonus-pado": "Pado Bonus",
  "ecosystem-bonus-game": "Game Reward",
  "ecosystem-bonus-airdrop": "Airdrop",
};

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

// ---- Helpers ----

/** Generate a deterministic GitHub-style identicon SVG for a wallet address. */
function generateWalletIdenticon(address: string): string {
  const clean = address.replace("0x", "").toLowerCase().padEnd(62, "0");
  const hue = parseInt(clean.slice(0, 6), 16) % 360;
  const sat = 50 + (parseInt(clean.slice(6, 8), 16) % 30);
  const light = 40 + (parseInt(clean.slice(8, 10), 16) % 20);
  const fgColor = `hsl(${hue},${sat}%,${light}%)`;
  const bgColor = `hsl(${hue},15%,12%)`;

  const cells: boolean[] = [];
  for (let i = 0; i < 15; i++) {
    cells.push(parseInt(clean.slice(10 + i * 2, 12 + i * 2), 16) % 2 === 0);
  }

  const CELL = 10;
  let rects = "";
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const idx = row * 3 + (col <= 2 ? col : 4 - col);
      if (cells[idx]) {
        rects += `<rect x="${col * CELL}" y="${row * CELL}" width="${CELL}" height="${CELL}" fill="${fgColor}"/>`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="64" height="64"><rect width="50" height="50" fill="${bgColor}"/>${rects}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

interface LoginIdentifier {
  label: string;
  value: string;
}

function getLoginIdentifier(
  user: {
    provider?: string;
    email?: string;
    twitterHandle?: string;
    originalTwitterHandle?: string;
    walletAddress?: string;
  } | null,
): LoginIdentifier | null {
  if (!user) return null;

  switch (user.provider) {
    case "Google":
      return user.email ? { label: "Google", value: user.email } : null;
    case "Twitter": {
      const displayHandle = user.originalTwitterHandle || user.twitterHandle;
      return displayHandle ? { label: "X", value: `@${displayHandle}` } : null;
    }
    case "MetaMask":
      return user.walletAddress
        ? {
            label: "Wallet",
            value: `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`,
          }
        : null;
    default:
      return user.walletAddress
        ? {
            label: "Wallet",
            value: `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`,
          }
        : null;
  }
}

// ---- Component ----

interface ProfileHeroCardProps {
  className?: string;
  /** Show inline activity points + V3 rank + ecosystem placeholder. Default false for backward compat with production. */
  showPoints?: boolean;
}

export const ProfileHeroCard: FC<ProfileHeroCardProps> = ({
  className = "",
  showPoints = false,
}) => {
  const { user } = useAuth();
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);


  const nasunWalletAddress =
    user?.linkedAccounts?.["nasun wallet"]?.walletAddress ??
    user?.walletAddress;
  const hasValidAddress =
    nasunWalletAddress && SUI_ADDRESS_RE.test(nasunWalletAddress);


  // ---- Ecosystem Score (for Health Status Bar, only when showPoints) ----
  const cognitoToken = showPoints ? user?.cognitoToken : undefined;
  const identityId = showPoints ? user?.identityId : undefined;
  const {
    score: ecosystemScore,
    isLoading: ecosystemLoading,
    refresh: refreshEcosystem,
    isRefreshing: ecosystemRefreshing,
    cooldownSeconds,
  } = useEcosystemScore(identityId);

  // Activation state from DynamoDB (real-time, not cached)
  const { getActivation } = useEcosystemStatus(cognitoToken, identityId);

  const hasGenesisPass = !!getActivation("genesis-pass");
  const hasActiveNft =
    !!getActivation("alliance") ||
    !!getActivation("genesis-pass") ||
    !!getActivation("battalion");

  // Ecosystem score values from API (single source of truth)
  const displayBaseScore = ecosystemScore?.daily.baseScore ?? 0;
  const displayMultiplier = ecosystemScore?.multiplier ?? 0;
  const displayTodayScore = ecosystemScore?.daily.ecosystemScore ?? 0;

  // ---- Display Name & Avatar ----
  const handleImageError = useCallback(() => setImageError(true), []);
  const handleImageLoad = useCallback(() => setImageLoaded(true), []);

  const displayName = (() => {
    if (!user) return "User";
    const tw = user.linkedAccounts?.twitter;
    const xDisplayName =
      user.provider === "Twitter" ? user.username : tw?.username;
    if (xDisplayName) return xDisplayName;

    const gl = user.linkedAccounts?.google;
    const email = user.provider === "Google" ? user.email : gl?.email;
    if (email) return email.split("@")[0];

    if (user.walletAddress) {
      return `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`;
    }
    return "User";
  })();

  const profileImageUrl = user?.profileImageUrl;

  const walletIdenticonUrl = useMemo(() => {
    if (user?.provider === "Nasun Wallet" && user.walletAddress) {
      return generateWalletIdenticon(user.walletAddress);
    }
    return null;
  }, [user?.provider, user?.walletAddress]);

  // ---- Category bar (all-time points breakdown by category) ----
  // scoreBreakdown includes base + all non-base categories directly from API.
  // No reverse calculation needed.
  const scoreBreakdown = ecosystemScore?.allTime.scoreBreakdown ?? [];
  const barSegments = useMemo(
    () => scoreBreakdown.filter((c) => c.points > 0),
    [scoreBreakdown],
  );
  const totalForBar = barSegments.reduce((s, c) => s + c.points, 0);

  if (!user)
    return (
      <OuterBox color="c1" padding="sm" className={className}>
        Loading...
      </OuterBox>
    );

  return (
    <OuterBox
      color="nw1"
      padding="sm"
      className={`animate-fade-slide-up ${className}`}
    >
      <div className="space-y-5">
        {/* Header: Avatar + Name */}
        <div className="flex items-center gap-4">
          <div className="relative">
            {(profileImageUrl && !imageError) || walletIdenticonUrl ? (
              <img
                src={
                  profileImageUrl && !imageError
                    ? profileImageUrl
                    : walletIdenticonUrl!
                }
                alt={displayName}
                className={`w-16 h-16 rounded-2xl object-cover bg-gray-800 ${
                  profileImageUrl && !imageError
                    ? imageLoaded
                      ? "opacity-100"
                      : "opacity-0"
                    : "opacity-100"
                }`}
                onError={handleImageError}
                onLoad={handleImageLoad}
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-nasun-c4 to-nasun-c5 flex items-center justify-center text-white text-2xl font-bold">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h6 className="font-semibold truncate">{displayName}</h6>
              <GenesisPassBadge />
            </div>
            {(() => {
              const loginId = getLoginIdentifier(user);
              return loginId ? (
                <p className="text-nasun-white/60">
                  <span className="text-slate-400 font-medium text-sm lg:text-base">
                    {loginId.value}
                  </span>
                </p>
              ) : null;
            })()}
          </div>
        </div>

        {/* Connected Accounts (production layout, when showPoints is off) */}
        {!showPoints && <ConnectedAccountsCard bare />}

        {/* Activity Points Summary + Ecosystem Placeholder (only in dev/renewed layout) */}
        {showPoints && (
          <>
            <div className="border border-dashed border-nasun-white/10 rounded-lg p-4">
              {/* Section title */}
              <h6 className="text-nasun-white mb-3 flex items-center gap-2">
                Ecosystem Points
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 normal-case">
                  Experimental
                </span>
                {hasActiveNft && (
                  <span className="ml-auto flex items-center gap-1.5">
                    {cooldownSeconds > 0 && (
                      <span className="text-[10px] text-nasun-white/30 tabular-nums">
                        {cooldownSeconds}s
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={refreshEcosystem}
                      disabled={ecosystemRefreshing || cooldownSeconds > 0}
                      className="text-xs text-nasun-white/40 hover:text-nasun-white/70 transition-colors disabled:opacity-30"
                      title={cooldownSeconds > 0 ? `Cooldown ${cooldownSeconds}s` : "Refresh points"}
                    >
                      <svg
                        className={`w-3.5 h-3.5 ${ecosystemRefreshing ? "animate-spin" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    </button>
                  </span>
                )}
                <InfoTooltip>
                  <p className="text-amber-400 font-semibold mb-1.5">
                    This feature may be buggy during the experimental phase. We
                    appreciate your patience.
                  </p>
                  <p>
                    Activate a Nasun membership NFT to start earning Ecosystem
                    Points. Your on-chain activity score, multiplier bonuses,
                    and bonus points are combined into a daily total. The
                    scoring formula may be adjusted at the operator's discretion
                    as we fix bugs and fine-tune the balance.
                  </p>
                </InfoTooltip>
              </h6>

              {!hasValidAddress ? (
                <p className="text-nasun-white/50 text-base">
                  Connect Nasun Wallet to view activity points
                </p>
              ) : ecosystemLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <Spinner size="sm" />
                  <span className="text-nasun-white/50 text-base">
                    Loading points...
                  </span>
                </div>
              ) : (
                <div className={!hasActiveNft ? "opacity-40 grayscale pointer-events-none select-none" : ""}>
                  {!hasActiveNft && (
                    <div className="flex justify-center mb-2">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-nasun-white/70 tracking-wide uppercase">
                        Paused - Activate an NFT to resume
                      </span>
                    </div>
                  )}
                  {/* All time score: baseline-aligned */}
                  <div className="flex items-baseline justify-center gap-3 mb-3">
                    <span className="text-lg font-semibold text-nasun-white uppercase tracking-wider">
                      All time
                    </span>
                    <span className="text-7xl font-semibold bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent leading-none">
                      {(
                        ecosystemScore?.allTime.ecosystemScore ?? 0
                      ).toLocaleString("en-US", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 1,
                      })}
                    </span>
                    <span className="text-lg font-semibold text-nasun-white uppercase tracking-wider">
                      pts
                    </span>
                  </div>

                  {/* Today + Formula (single line) */}
                  <div className="flex items-baseline justify-center flex-wrap gap-x-2 gap-y-1">
                    <span className="text-2xl font-bold text-amber-400">
                      {displayTodayScore.toLocaleString("en-US", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 1,
                      })}
                    </span>
                    <span className="text-sm text-nasun-white/70">
                      pts today
                    </span>
                    <span className="text-sm text-nasun-white/40 ml-1">=</span>
                    <span className="text-sm text-nasun-white/60 ml-1">
                      <span className="font-mono text-nasun-white/80">
                        {displayBaseScore}
                      </span>{" "}
                      base
                      <span className="text-nasun-white/40"> x </span>
                      <span className="font-mono text-nasun-white/80">
                        {displayMultiplier.toFixed(1)}
                      </span>{" "}
                      mult
                      <span className="text-nasun-white/40"> + </span>
                      <span className="font-mono text-nasun-white/80">
                        {Math.max(0, displayTodayScore - Math.round(displayBaseScore * displayMultiplier))}
                      </span>{" "}
                      bonus
                    </span>
                  </div>

                  {/* Score Composition Bar (base + bonus categories) */}
                  {barSegments.length > 0 && totalForBar > 0 && (
                    <div>
                      <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                        {barSegments.map((seg) => {
                          const pct = (seg.points / totalForBar) * 100;
                          if (pct < 1) return null;
                          return (
                            <div
                              key={seg.category}
                              className={`${CATEGORY_COLORS[seg.category] || "bg-gray-400"} transition-all`}
                              style={{ width: `${pct}%` }}
                              title={`${CATEGORY_LABELS[seg.category] || seg.category}: ${seg.points.toLocaleString("en-US")} pts`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                        {barSegments.map((seg) => (
                          <span
                            key={seg.category}
                            className="flex items-center gap-1 text-xs text-nasun-white/40"
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${CATEGORY_COLORS[seg.category] || "bg-gray-400"}`}
                            />
                            {CATEGORY_LABELS[seg.category] || seg.category}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Airdrop Registration Bar */}
            <AirdropRegistrationCard bare />

            {/* Daily Missions + Health Donut (side by side) */}
            <div className="flex gap-4">
              <div className="flex-[2] min-w-0">
                <DailyMissionsCard bare />
              </div>
              <div className="flex-[1] min-w-0 border border-dashed border-nasun-white/10 rounded-lg flex items-center justify-center">
                <HealthStatusBar
                  activeDays={ecosystemScore?.weekly?.activeDays ?? 0}
                  isPenalized={ecosystemScore?.isPenalized ?? false}
                  hasGenesisPass={hasGenesisPass}
                  hasActiveNft={hasActiveNft}
                  isLoading={ecosystemLoading}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </OuterBox>
  );
};

function InfoTooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-nasun-white/50 text-[10px] leading-none text-nasun-white/70 hover:border-nasun-white/80 hover:text-nasun-white transition-colors"
        aria-label="More info"
      >
        i
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-2 w-96 rounded-lg border border-nasun-c6/60 bg-nasun-c6 p-2 text-left text-sm leading-snug text-nasun-white/70 shadow-lg">
          <div className="absolute left-1/2 bottom-full -translate-x-1/2 border-4 border-transparent border-b-nasun-c6" />
          {children}
        </div>
      )}
    </div>
  );
}
