/**
 * ProfileHeroCard Component
 *
 * Hero card for the My Account dashboard.
 * Shows: Avatar, username, activity points summary (absorbed from PointsCard),
 * V3 leaderboard rank, and placeholder for ecosystem score (Step 5D).
 *
 * Connected Accounts management has been extracted to ConnectedAccountsCard.
 */

import { FC, useState, useCallback, useMemo, useEffect } from "react";
import { useAuth } from "@/features/auth";
import { getPointsUser } from "@/services/activityPointsApi";
import type { UserPoints } from "@/types/points";
import { getTwitterHandle } from "@/utils/getTwitterHandle";
import { useRankHistory, useActiveSeason } from "@/features/leaderboard-v3/hooks";
import { OuterBox, Spinner } from "@/components/ui";
import { GenesisPassBadge } from "./components/StatusBadges";

// ---- Category display config ----

const CATEGORY_COLORS: Record<string, string> = {
  staking: "bg-emerald-500",
  "pado-dex": "bg-blue-500",
  governance: "bg-purple-500",
  "pado-prediction": "bg-amber-500",
  "pado-lottery": "bg-pink-500",
  "pado-perp": "bg-red-500",
  "pado-lending": "bg-cyan-500",
  "baram-ai": "bg-indigo-500",
  "baram-executor": "bg-violet-500",
  "wallet-transfer": "bg-gray-500",
  "referral-bonus": "bg-amber-500",
};

const CATEGORY_LABELS: Record<string, string> = {
  staking: "Staking",
  "pado-dex": "DEX",
  governance: "Governance",
  "pado-prediction": "Prediction",
  "pado-lottery": "Lottery",
  "pado-perp": "Perp",
  "pado-lending": "Lending",
  "baram-ai": "Baram AI",
  "baram-executor": "Executor",
  "wallet-transfer": "Transfer",
  "referral-bonus": "Referral",
};

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

// ---- Helpers ----

/** Generate a deterministic GitHub-style identicon SVG for a wallet address. */
function generateWalletIdenticon(address: string): string {
  const clean = address.replace('0x', '').toLowerCase().padEnd(62, '0');
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
  let rects = '';
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

export const ProfileHeroCard: FC<ProfileHeroCardProps> = ({ className = "", showPoints = false }) => {
  const { user } = useAuth();
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // ---- Points Data (only fetched when showPoints is true) ----
  const [points, setPoints] = useState<UserPoints | null>(null);
  const [pointsLoading, setPointsLoading] = useState(true);
  const [pointsError, setPointsError] = useState<string | null>(null);

  const nasunWalletAddress =
    user?.linkedAccounts?.["nasun wallet"]?.walletAddress ?? user?.walletAddress;
  const hasValidAddress = nasunWalletAddress && SUI_ADDRESS_RE.test(nasunWalletAddress);

  useEffect(() => {
    if (!showPoints || !hasValidAddress) {
      setPointsLoading(false);
      return;
    }

    let cancelled = false;
    setPointsLoading(true);
    setPointsError(null);

    getPointsUser(nasunWalletAddress!)
      .then((data) => { if (!cancelled) setPoints(data); })
      .catch((err) => { if (!cancelled) setPointsError(err.message); })
      .finally(() => { if (!cancelled) setPointsLoading(false); });

    return () => { cancelled = true; };
  }, [showPoints, nasunWalletAddress, hasValidAddress]);

  // ---- V3 Leaderboard Rank (only when showPoints) ----
  const twitterUsername = showPoints ? getTwitterHandle(user) : null;
  const activeSeason = useActiveSeason();
  const { data: rankData } = useRankHistory({
    seasonId: activeSeason?.seasonId,
    days: 7,
    enabled: !!twitterUsername && !!activeSeason?.seasonId,
  });

  // ---- Display Name & Avatar ----
  const handleImageError = useCallback(() => setImageError(true), []);
  const handleImageLoad = useCallback(() => setImageLoaded(true), []);

  const displayName = (() => {
    if (!user) return "User";
    const tw = user.linkedAccounts?.twitter;
    const xDisplayName = user.provider === "Twitter" ? user.username : tw?.username;
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

  // ---- Derived Points Values ----
  const totalPts = points ? Number(points.totalPoints) : 0;
  const totalForBar = points?.categories.reduce((sum, c) => sum + Number(c.points), 0) ?? 0;
  const firstDate = points?.firstActivity
    ? new Date(points.firstActivity).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  if (!user)
    return (
      <OuterBox color="c1" padding="sm" className={className}>
        Loading...
      </OuterBox>
    );

  return (
    <OuterBox color="nw1" padding="sm" className={`animate-fade-slide-up ${className}`}>
      <div className="space-y-5">
        {/* Header: Avatar + Name */}
        <div className="flex items-center gap-4">
          <div className="relative">
            {(walletIdenticonUrl || (profileImageUrl && !imageError)) ? (
              <img
                src={walletIdenticonUrl ?? profileImageUrl!}
                alt={displayName}
                className={`w-16 h-16 rounded-2xl object-cover bg-gray-800 ${
                  walletIdenticonUrl || imageLoaded ? "opacity-100" : "opacity-0"
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

        {/* Activity Points Summary + Ecosystem Placeholder (only in dev/renewed layout) */}
        {showPoints && (
          <>
            <div>
              <h6 className="text-sm text-nasun-white/40 uppercase mb-2 flex items-center gap-2">
                Activity Points
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 normal-case">
                  Experimental
                </span>
              </h6>

              {!hasValidAddress ? (
                <p className="text-nasun-white/50 text-sm">
                  Connect Nasun Wallet to view activity points
                </p>
              ) : pointsLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <Spinner size="sm" />
                  <span className="text-nasun-white/50 text-sm">Loading points...</span>
                </div>
              ) : pointsError ? (
                <p className="text-red-400 text-sm">Failed to load points</p>
              ) : !points ? (
                <p className="text-nasun-white/50 text-sm">No activity points yet</p>
              ) : (
                <div>
                  {/* Total Points + Stats Row */}
                  <div className="flex items-baseline gap-4 mb-3">
                    <div>
                      <span className="text-3xl font-bold text-nasun-white">
                        {totalPts.toLocaleString("en-US")}
                      </span>
                      <span className="text-sm font-normal text-nasun-white/50 ml-2">pts</span>
                    </div>
                    {/* V3 Rank */}
                    {rankData?.stats?.currentRank != null && rankData.stats.currentRank > 0 && (
                      <div className="flex items-baseline gap-1 text-nasun-white/60">
                        <span className="text-xs uppercase">Rank</span>
                        <span className="text-lg font-semibold text-nasun-c7">
                          #{rankData.stats.currentRank}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Category Distribution Bar */}
                  {points.categories.length > 0 && totalForBar > 0 && (
                    <div className="mb-3">
                      <div className="flex h-2 rounded-full overflow-hidden gap-px">
                        {points.categories.map((cat) => {
                          const pct = (Number(cat.points) / totalForBar) * 100;
                          if (pct < 1) return null;
                          return (
                            <div
                              key={cat.category}
                              className={`${CATEGORY_COLORS[cat.category] || "bg-gray-400"} transition-all`}
                              style={{ width: `${pct}%` }}
                              title={`${CATEGORY_LABELS[cat.category] || cat.category}: ${Number(cat.points).toLocaleString("en-US")} pts`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                        {points.categories.map((cat) => (
                          <span key={cat.category} className="flex items-center gap-1 text-xs text-nasun-white/60">
                            <span className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[cat.category] || "bg-gray-400"}`} />
                            {CATEGORY_LABELS[cat.category] || cat.category}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="text-xs text-nasun-white/40">
                    {points.activityCount} {points.activityCount === 1 ? "activity" : "activities"}
                    {firstDate && <span> &middot; Since {firstDate}</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Ecosystem Score Placeholder (Step 5D) */}
            <div className="border border-dashed border-nasun-white/10 rounded-lg p-4">
              <h6 className="text-sm text-nasun-white/30 uppercase mb-1">Ecosystem Score</h6>
              <p className="text-nasun-white/20 text-xs">Coming soon</p>
            </div>
          </>
        )}
      </div>
    </OuterBox>
  );
};
