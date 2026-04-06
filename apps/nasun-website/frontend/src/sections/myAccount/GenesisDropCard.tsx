/**
 * GenesisDropCard Component
 *
 * Compact status card showing Genesis Pass Drop countdown
 * and user's allowlist eligibility on the My Account page.
 */

import { FC } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useGenesisPassStatus } from "@/hooks/useGenesisPassStatus";
import { useGenesisPassOwnership } from "@/hooks/useGenesisPassOwnership";
import { useGenesisDropCountdown } from "@/hooks/useGenesisDropCountdown";

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

// DEV: override allowlist state via ?mockMint= query param
// Values: FREE_MINT, GUARANTEED, FCFS, NONE
function useMockOverride(
  realMintType: string | null,
  realIsRegistered: boolean,
  realHasMinted: boolean,
): { mintType: string | null; isRegistered: boolean; hasMinted: boolean } {
  const [params] = useSearchParams();
  const mock = params.get("mockMint");
  if (!mock || !import.meta.env.DEV) return { mintType: realMintType, isRegistered: realIsRegistered, hasMinted: realHasMinted };

  switch (mock) {
    case "FREE_MINT": return { mintType: "FREE_MINT", isRegistered: true, hasMinted: false };
    case "GUARANTEED": return { mintType: "GUARANTEED", isRegistered: true, hasMinted: false };
    case "FCFS": return { mintType: "FCFS", isRegistered: true, hasMinted: false };
    case "NONE": return { mintType: null, isRegistered: false, hasMinted: false };
    case "MINTED": return { mintType: realMintType, isRegistered: realIsRegistered, hasMinted: true };
    default: return { mintType: realMintType, isRegistered: realIsRegistered, hasMinted: realHasMinted };
  }
}

interface GenesisDropCardProps {
  className?: string;
}

export const GenesisDropCard: FC<GenesisDropCardProps> = ({
  className = "",
}) => {
  const { user } = useAuth();
  const cognitoToken = user?.cognitoToken;

  const walletAddress =
    user?.linkedAccounts?.metamask?.walletAddress ||
    (user?.provider === "MetaMask" ? user.walletAddress : undefined);

  const { mintType: realMintType, isRegistered: realIsRegistered } = useGenesisPassStatus(
    walletAddress,
    cognitoToken,
  );
  const { hasMinted: realHasMinted } = useGenesisPassOwnership(walletAddress);
  const { mintType, isRegistered, hasMinted } = useMockOverride(realMintType, realIsRegistered, realHasMinted);
  const { title, subtitle, countdownLabel, timeLeft, phase } =
    useGenesisDropCountdown(mintType, isRegistered, hasMinted);

  const dotColor =
    phase === "ENDED"
      ? "bg-nasun-white/30"
      : phase === "BEFORE"
        ? "bg-yellow-400"
        : "bg-emerald-400";

  const dotPulse = phase === "DURING" || phase === "MINTED" || phase === "AFTER_STAGE";

  return (
    <Link
      to="/wave1/genesis-pass-drop"
      className={`relative block rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 text-nasun-black
        px-5 py-4 hover:from-amber-400/90 hover:via-amber-500/90 hover:to-orange-500/90 transition-colors ${className}`}
    >
      {/* Minted badge - top right */}
      {phase === "MINTED" && (
        <span className="absolute top-3 right-4 text-[11px] font-semibold uppercase tracking-wide bg-emerald-500 text-white px-2 py-0.5 rounded-full">
          Minted
        </span>
      )}

      {/* Title row */}
      <div className="flex items-center gap-2 mb-1">
        <span className="relative flex h-2.5 w-2.5">
          {dotPulse && (
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75 animate-ping`}
            />
          )}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotColor}`}
          />
        </span>
        <span className="text-sm font-semibold uppercase tracking-wider text-nasun-black">
          {title}
        </span>
      </div>

      {/* Eligibility subtitle */}
      <p className="text-base text-nasun-black/60 mb-3">{subtitle}</p>

      {/* Countdown bar */}
      {timeLeft && countdownLabel && (
        <div className="flex items-center justify-between bg-nasun-black rounded-lg px-4 py-3">
          <span className="text-sm text-nasun-white/70 uppercase font-medium tracking-wide">
            {countdownLabel}
          </span>
          <span className="font-mono text-lg font-semibold text-nasun-white tabular-nums">
            {timeLeft.days > 0 && `${pad2(timeLeft.days)}d `}
            {pad2(timeLeft.hours)}h {pad2(timeLeft.minutes)}m{" "}
            {pad2(timeLeft.seconds)}s
          </span>
        </div>
      )}
    </Link>
  );
};
