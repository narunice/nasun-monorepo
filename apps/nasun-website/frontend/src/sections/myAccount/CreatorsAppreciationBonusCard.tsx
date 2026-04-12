/**
 * CreatorsAppreciationBonusCard
 *
 * One-time +60 ecosystem points for Top 500 creators of Community
 * Leaderboard v3 Season 1 (snapshot 2026-04-09).
 *
 * The card returns null unless the backend reports the caller as
 * eligible. Eligible users see their rank, the 60pt amount, a countdown
 * to the UTC claim deadline, and a Claim button (or a "Claimed" state
 * once redeemed).
 */

import { FC, useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/features/auth";
import { OuterBox, Spinner } from "@/components/ui";
import { ButtonV3 } from "@/components/ui/button-v3";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useCreatorsAppreciationBonus } from "./hooks/useCreatorsAppreciationBonus";

interface CreatorsAppreciationBonusCardProps {
  className?: string;
  /** When true, render with a dashed inline border instead of OuterBox,
   *  for embedding inside another card (e.g. ProfileHeroCard). */
  bare?: boolean;
}

function formatRemaining(deadlineMs: number, nowMs: number): string {
  const diff = Math.max(0, deadlineMs - nowMs);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export const CreatorsAppreciationBonusCard: FC<CreatorsAppreciationBonusCardProps> = ({
  className = "",
  bare = false,
}) => {
  const { user } = useAuth();
  const cognitoToken = user?.cognitoToken;
  const { status, isClaiming, error, claim } =
    useCreatorsAppreciationBonus(cognitoToken);

  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Hide the card in every non-eligible condition (logged out, loading,
  // query error, or backend says not eligible). No flicker, no exposure
  // of the feature to ineligible users.
  const shouldRender = !!cognitoToken && !!status && status.eligible;

  // Per-second countdown, only while the card is actually rendered.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!shouldRender) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [shouldRender]);

  const deadlineMs = useMemo(
    () => (status?.claimDeadline ? Date.parse(status.claimDeadline) : 0),
    [status?.claimDeadline],
  );
  const remaining = useMemo(
    () => (deadlineMs ? formatRemaining(deadlineMs, now) : ""),
    [deadlineMs, now],
  );
  const utcDeadlineLabel = useMemo(() => {
    if (!deadlineMs) return "";
    try {
      // Derive the UTC label from the server-provided deadline so a
      // change to CREATORS_APPRECIATION_DEADLINE_ISO on the backend
      // flows through the UI without a frontend redeploy.
      return new Date(deadlineMs).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      });
    } catch {
      return "";
    }
  }, [deadlineMs]);
  const localDeadlineLabel = useMemo(() => {
    if (!deadlineMs) return "";
    try {
      return new Date(deadlineMs).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return "";
    }
  }, [deadlineMs]);

  const handleConfirmedClaim = useCallback(async () => {
    setShowConfirm(false);
    const ok = await claim();
    if (ok) setShowSuccess(true);
  }, [claim]);

  if (!shouldRender) return null;

  const claimed = !!status!.claimed;
  const expired = !!status!.expired;
  const canClaim = !claimed && !expired;

  let buttonLabel = "Claim 60 Points";
  let buttonDisabled = false;
  if (claimed) {
    buttonLabel = "Claimed";
    buttonDisabled = true;
  } else if (expired) {
    buttonLabel = "Expired";
    buttonDisabled = true;
  } else if (isClaiming) {
    buttonLabel = "Claiming...";
    buttonDisabled = true;
  }

  // Once the user has claimed, collapse the card to just the heading
  // and a compact "+60 pts claimed" confirmation to reduce visual noise.
  const claimedContent = (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <h5 className="font-medium text-nasun-white text-sm md:text-base">
        Creators Appreciation Bonus
      </h5>
      <span className="text-sm text-emerald-400">
        <span className="font-mono font-semibold text-teal-300">+60 pts</span>{" "}
        claimed
      </span>
    </div>
  );

  const unclaimedContent = (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h5 className="font-medium text-nasun-white text-sm md:text-base">
            Creators Appreciation Bonus
          </h5>
          <p className="text-nasun-white/80 text-sm leading-snug">
            A one-time recognition of your creative contributions during
            Season 1 of the Creators Leaderboard.
          </p>
        </div>

        <div className="flex items-baseline gap-3 flex-wrap justify-end min-w-0">
          <span className="font-mono text-2xl md:text-3xl font-semibold text-teal-300 shrink-0">
            +60 pts
          </span>
          {status!.rank != null && (
            <span className="text-sm text-nasun-white/60 break-words min-w-0">
              Season 1 rank at pause: #{status!.rank}
              {status!.handle ? ` · @${status!.handle}` : ""}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-nasun-white/80">
          {expired ? (
            <span className="text-red-400">Claim window closed</span>
          ) : (
            <span>
              Closes in <span className="text-teal-300 font-mono">{remaining}</span>
              <span className="text-nasun-white/50">
                {utcDeadlineLabel ? ` (${utcDeadlineLabel} UTC` : ""}
                {utcDeadlineLabel && localDeadlineLabel
                  ? ` · ${localDeadlineLabel} local)`
                  : utcDeadlineLabel
                    ? ")"
                    : ""}
              </span>
            </span>
          )}
        </div>

        <ButtonV3
          variant="nw2"
          size="sm"
          disabled={buttonDisabled}
          onClick={() => setShowConfirm(true)}
        >
          {isClaiming && <Spinner className="w-3 h-3 mr-1" />}
          {buttonLabel}
        </ButtonV3>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );

  const content = (
    <>
      {claimed ? claimedContent : unclaimedContent}

      {/* Confirm dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-sm text-center !bg-slate-800">
          <DialogHeader className="items-center">
            <DialogTitle>Claim Creators Appreciation Bonus</DialogTitle>
            <DialogDescription className="text-nasun-white/70 pt-2">
              Add <span className="text-teal-300 font-mono">+60 pts</span> to
              your all-time ecosystem points?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-3 mt-2">
            <ButtonV3
              variant="nw2"
              size="sm"
              onClick={handleConfirmedClaim}
              disabled={isClaiming || !canClaim}
            >
              {isClaiming ? "Claiming..." : "Claim"}
            </ButtonV3>
            <ButtonV3
              variant="nw2"
              size="sm"
              outline
              onClick={() => setShowConfirm(false)}
            >
              Cancel
            </ButtonV3>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success dialog, shown only after a successful claim */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="max-w-sm text-center !bg-slate-800">
          <DialogHeader className="items-center">
            <DialogTitle>Bonus Claimed</DialogTitle>
            <DialogDescription className="text-nasun-white/70 pt-2">
              60 ecosystem points have been added to your account. Thank you
              for your contributions.
            </DialogDescription>
          </DialogHeader>
          <ButtonV3
            variant="nw2"
            size="sm"
            onClick={() => setShowSuccess(false)}
            className="mt-2"
          >
            Close
          </ButtonV3>
        </DialogContent>
      </Dialog>
    </>
  );

  if (bare) {
    return (
      <div
        className={`border border-teal-400/60 bg-teal-900/30 rounded-lg p-4 ${className}`}
      >
        {content}
      </div>
    );
  }

  return (
    <OuterBox
      color="c5"
      padding="md"
      className={`!border-teal-400/60 !bg-teal-900/30 ${className}`}
    >
      {content}
    </OuterBox>
  );
};
