/**
 * GenesisDropCard Component
 *
 * Compact status card showing Genesis Pass Drop countdown
 * and user's allowlist eligibility on the My Account page.
 */

import { FC } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useGenesisPassStatus } from "@/hooks/useGenesisPassStatus";
import { useGenesisPassOwnership } from "@/hooks/useGenesisPassOwnership";
import { useGenesisDropCountdown } from "@/hooks/useGenesisDropCountdown";

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

interface GenesisDropCardProps {
  className?: string;
}

export const GenesisDropCard: FC<GenesisDropCardProps> = ({
  className = "",
}) => {
  const { user, cognitoToken } = useAuth();

  const walletAddress =
    user?.linkedAccounts?.metamask?.walletAddress ||
    (user?.provider === "MetaMask" ? user.walletAddress : undefined);

  const { mintType, isRegistered } = useGenesisPassStatus(
    walletAddress,
    cognitoToken,
  );
  const { hasMinted } = useGenesisPassOwnership(walletAddress);
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
      className={`block border border-nasun-white/10 rounded-xl bg-nasun-black/60 backdrop-blur-sm
        px-5 py-4 hover:border-nasun-white/25 transition-colors ${className}`}
    >
      {/* Title row */}
      <div className="flex items-center gap-2 mb-1.5">
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
        <span className="text-xs font-semibold uppercase tracking-wider text-nasun-white/90">
          {title}
        </span>
      </div>

      {/* Eligibility subtitle */}
      <p className="text-sm text-nasun-white/60 mb-3">{subtitle}</p>

      {/* Countdown */}
      {timeLeft && countdownLabel && (
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-nasun-white/40 uppercase">
            {countdownLabel}
          </span>
          <span className="font-mono text-sm text-nasun-white tabular-nums">
            {timeLeft.days > 0 && `${pad2(timeLeft.days)}d `}
            {pad2(timeLeft.hours)}h {pad2(timeLeft.minutes)}m{" "}
            {pad2(timeLeft.seconds)}s
          </span>
        </div>
      )}
    </Link>
  );
};
