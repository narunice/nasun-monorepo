/**
 * ReferralCard Component
 *
 * Referral program card for the Bento Grid layout.
 * Shows referral code, copy/share buttons, and invitee stats.
 */

import { FC, ReactNode, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/features/auth";
import {
  getMyReferralCode,
  getMyReferralStats,
  submitAppeal,
  ReferralApiError,
  type ReferralStats,
} from "@/services/referralApi";
import { OuterBox, Spinner } from "@/components/ui";

interface ReferralCardProps {
  className?: string;
}

interface NotEligibleInfo {
  hint?: string;
  closestPath?: string;
  adminCuratedBonusTotal?: number;
}

export const ReferralCard: FC<ReferralCardProps> = ({ className = "" }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notEligible, setNotEligible] = useState<NotEligibleInfo | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);

  const token = user?.cognitoToken;
  const isConfigured = !!import.meta.env.VITE_REFERRAL_API;

  useEffect(() => {
    if (!token || !isConfigured) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setNotEligible(null);
    setPending(false);

    // Stats are independent of code issuance and shown for users who already
    // have a code; load them in parallel and tolerate failure independently.
    getMyReferralStats(token)
      .then((statsRes) => {
        if (!cancelled) setStats(statsRes);
      })
      .catch(() => {
        // non-fatal
      });

    getMyReferralCode(token)
      .then((codeRes) => {
        if (cancelled) return;
        setReferralCode(codeRes.referralCode);
      })
      .catch((err: ReferralApiError | Error) => {
        if (cancelled) return;
        if (err instanceof ReferralApiError) {
          if (err.errorCode === "NOT_ELIGIBLE") {
            setNotEligible({
              hint: err.details?.hint as string | undefined,
              closestPath: err.details?.closestPath as string | undefined,
              adminCuratedBonusTotal: err.details?.adminCuratedBonusTotal as
                | number
                | undefined,
            });
            return;
          }
          if (err.errorCode === "ELIGIBILITY_PENDING") {
            setPending(true);
            return;
          }
        }
        setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, isConfigured]);

  const referralLink = referralCode
    ? `${window.location.origin}?ref=${referralCode}`
    : null;

  const handleCopy = useCallback(async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [referralLink]);

  const reloadStats = useCallback(async () => {
    if (!token) return;
    try {
      const s = await getMyReferralStats(token);
      setStats(s);
    } catch {
      // non-fatal
    }
  }, [token]);

  const handleAppealSubmit = useCallback(async () => {
    if (!token) return;
    const text = appealText.trim();
    if (text.length < 10 || text.length > 1000) {
      setAppealError("Appeal must be 10-1000 characters");
      return;
    }
    setAppealSubmitting(true);
    setAppealError(null);
    try {
      await submitAppeal(token, text);
      setAppealOpen(false);
      setAppealText("");
      await reloadStats();
    } catch (err) {
      setAppealError(err instanceof Error ? err.message : "Failed to submit appeal");
    } finally {
      setAppealSubmitting(false);
    }
  }, [token, appealText, reloadStats]);

  const handleShareX = useCallback(() => {
    if (!referralLink) return;
    const text = `Join me on Nasun — a new L1 blockchain with finance, gaming, AI, and more. Devnet is live.\n\n${referralLink}`;
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [referralLink]);

  const title = (
    <h5 className="font-medium uppercase text-nasun-white mb-4 flex items-center gap-2">
      REFERRAL PROGRAM
      <span className="text-sm font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 normal-case">
        New
      </span>
    </h5>
  );

  // Not logged in
  if (!token) {
    return (
      <OuterBox color="w2" padding="sm" className={className}>
        {title}
        <p className="text-nasun-white/80 text-center text-base py-4">
          Sign in to access the referral program
        </p>
      </OuterBox>
    );
  }

  // API not configured
  if (!isConfigured) {
    return (
      <OuterBox color="w2" padding="sm" className={className}>
        {title}
        <p className="text-nasun-white/80 text-center text-base py-4">
          Referral program coming soon
        </p>
      </OuterBox>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <OuterBox color="w2" padding="sm" className={className}>
        {title}
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </OuterBox>
    );
  }

  // Eligibility pending (GP cache warming up)
  if (pending) {
    return (
      <OuterBox color="w2" padding="sm" className={className}>
        {title}
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <Spinner />
          <p className="text-sm text-nasun-white/80">Checking eligibility...</p>
        </div>
      </OuterBox>
    );
  }

  // Not eligible: show static gate explanation
  if (notEligible) {
    return (
      <OuterBox color="w2" padding="sm" className={className}>
        {title}
        <div className="space-y-3">
          <p className="text-base text-nasun-white">
            Referral codes are reserved for active Nasun contributors. You can
            earn one by:
          </p>
          <ul className="text-sm text-nasun-white/80 space-y-1.5 list-disc pl-5">
            <li>Voting on a governance proposal</li>
            <li>Holding a Genesis Pass NFT</li>
            <li>
              Earning 40+ admin-curated bonus points (creator posts, bug
              reports, feedback)
            </li>
            <li>
              Connecting X, Google, and Telegram + earning 25+ admin-curated
              bonus points
            </li>
          </ul>
          {typeof notEligible.adminCuratedBonusTotal === "number" && (
            <p className="text-sm text-nasun-white/80 pt-2 border-t border-nasun-white/10">
              Your admin-curated bonus points:{" "}
              {notEligible.adminCuratedBonusTotal}
            </p>
          )}
          {notEligible.hint && (
            <p className="text-sm text-amber-400">{notEligible.hint}</p>
          )}
        </div>
      </OuterBox>
    );
  }

  // Error
  if (error) {
    return (
      <OuterBox color="w2" padding="sm" className={className}>
        {title}
        <p className="text-red-400 text-base text-center py-4">
          Failed to load referral data
        </p>
      </OuterBox>
    );
  }

  const declineInfo = stats?.declineInfo || null;

  if (declineInfo) {
    const retryMs = Date.parse(declineInfo.retryAt) || 0;
    const remainingDays = retryMs > Date.now()
      ? Math.ceil((retryMs - Date.now()) / (24 * 60 * 60 * 1000))
      : 0;
    const retryReadable = declineInfo.retryAt
      ? new Date(declineInfo.retryAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "-";

    let bannerTitle = "";
    let bannerTone = "rose";
    let bannerBody: ReactNode = null;
    let actionButton: ReactNode = null;

    if (declineInfo.status === "DECLINED" && !declineInfo.appealResolution) {
      bannerTitle = "Your referral was declined";
      bannerBody = (
        <>
          <p className="text-sm text-nasun-white/90 whitespace-pre-wrap">{declineInfo.reviewerNote}</p>
          <p className="text-xs text-nasun-white/60">
            You can re-apply on {retryReadable}
            {remainingDays > 0 ? ` (${remainingDays} day${remainingDays === 1 ? "" : "s"} left)` : ""}.
          </p>
        </>
      );
      actionButton = (
        <button
          onClick={() => { setAppealOpen(true); setAppealError(null); }}
          className="px-3 py-1.5 rounded bg-nasun-white/10 hover:bg-nasun-white/20 text-nasun-white text-sm"
        >
          Submit appeal
        </button>
      );
    } else if (declineInfo.status === "APPEALED" && !declineInfo.appealResolution) {
      bannerTone = "amber";
      bannerTitle = "Appeal under review";
      bannerBody = (
        <>
          <p className="text-xs text-nasun-white/60 uppercase">Original decline reason</p>
          <p className="text-sm text-nasun-white/90 whitespace-pre-wrap">{declineInfo.reviewerNote}</p>
          <p className="text-xs text-nasun-white/60 uppercase mt-2">Your appeal</p>
          <p className="text-sm text-nasun-white/90 whitespace-pre-wrap">{declineInfo.appealText}</p>
          <p className="text-xs text-nasun-white/60 mt-2">
            Submitted on {declineInfo.appealedAt
              ? new Date(declineInfo.appealedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "-"}
          </p>
        </>
      );
    } else if (declineInfo.appealResolution === "reconfirmed") {
      bannerTitle = "Appeal denied";
      bannerBody = (
        <>
          <p className="text-sm text-nasun-white/90 whitespace-pre-wrap">{declineInfo.reviewerNote}</p>
          <p className="text-xs text-nasun-white/60">
            You can re-apply on {retryReadable}
            {remainingDays > 0 ? ` (${remainingDays} day${remainingDays === 1 ? "" : "s"} left)` : ""}.
          </p>
        </>
      );
    }

    if (bannerTitle) {
      const toneClasses = bannerTone === "amber"
        ? "border-amber-500/40 bg-amber-500/10"
        : "border-rose-500/40 bg-rose-500/10";
      return (
        <OuterBox color="w2" padding="sm" className={className}>
          {title}
          <div className={"rounded border p-4 space-y-2 " + toneClasses}>
            <p className="text-nasun-white font-semibold">{bannerTitle}</p>
            {bannerBody}
            {actionButton && <div className="pt-2">{actionButton}</div>}
          </div>

          {appealOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="bg-nasun-c6 border border-nasun-white/20 rounded p-5 w-full max-w-md">
                <h3 className="text-lg font-semibold text-nasun-white mb-2">Submit appeal</h3>
                <p className="text-sm text-nasun-white/80 mb-3">
                  Explain why you believe this referral should be approved. An
                  admin will review your appeal. You can only submit once.
                </p>
                <textarea
                  value={appealText}
                  onChange={(e) => setAppealText(e.target.value)}
                  placeholder="Your appeal (10-1000 characters)"
                  rows={6}
                  maxLength={1000}
                  className="w-full bg-nasun-white/5 border border-nasun-white/20 rounded px-2 py-1.5 text-sm text-nasun-white"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-nasun-white/50">{appealText.trim().length}/1000</span>
                  {appealError && <span className="text-xs text-rose-400">{appealError}</span>}
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => { setAppealOpen(false); setAppealError(null); }}
                    disabled={appealSubmitting}
                    className="px-3 py-1.5 rounded bg-nasun-white/5 hover:bg-nasun-white/10 text-nasun-white text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleAppealSubmit()}
                    disabled={appealSubmitting}
                    className="px-3 py-1.5 rounded bg-emerald-500/40 hover:bg-emerald-500/60 text-white text-sm disabled:opacity-50"
                  >
                    {appealSubmitting ? "Submitting…" : "Submit appeal"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </OuterBox>
      );
    }
  }

  return (
    <OuterBox color="w2" padding="sm" className={className}>
      {title}

      {/* Referral Code + Copy */}
      {referralCode && (
        <div className="mb-4">
          <p className="text-sm text-nasun-white/80 mb-1.5">
            Your referral code
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-nasun-c6/50 px-3 py-2 rounded text-nasun-white font-mono text-lg tracking-widest text-center">
              {referralCode}
            </code>
            <button
              onClick={handleCopy}
              className="px-3 py-2 rounded bg-nasun-c4/20 hover:bg-nasun-c4/40 text-nasun-c3 text-base transition-colors"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>
      )}

      {/* Share on X */}
      {referralLink && (
        <button
          onClick={handleShareX}
          className="w-full mb-4 px-3 py-2 rounded bg-nasun-white/5 hover:bg-nasun-white/10 text-nasun-white/80 text-base transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Share on X
        </button>
      )}

      {/* Stats */}
      {stats && (
        <div className="space-y-3">
          {/* Counters */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-bold text-nasun-white">
                {stats.totalReferrals}
              </p>
              <p className="text-sm text-nasun-white/80 uppercase">Invited</p>
            </div>
            <div>
              <p className="text-xl font-bold text-emerald-400">
                {stats.activatedCount}
              </p>
              <p className="text-sm text-nasun-white/80 uppercase">Active</p>
            </div>
            <div>
              <p className="text-xl font-bold text-amber-400">
                {stats.bonusStats?.totalBonusPoints?.toLocaleString("en-US") ??
                  "0"}
              </p>
              <p className="text-sm text-nasun-white/80 uppercase">Bonus Pts</p>
            </div>
          </div>

          {/* Referred by info */}
          {stats.referredBy && (
            <div className="text-sm text-nasun-white/80 text-center pt-1 border-t border-nasun-white/10">
              Referred on{" "}
              {new Date(stats.referredBy.appliedAt).toLocaleDateString(
                "en-US",
                {
                  month: "short",
                  day: "numeric",
                },
              )}
            </div>
          )}

          {/* How it works */}
          <div className=" text-nasun-white/80 pt-2 border-t border-nasun-white/10 space-y-1">
            <p className="text-sm">
              Earn 10% of your referrals' on-chain activity. Referred users also
              earn 10%.
            </p>
            <p className="text-sm">
              Bonuses are active for 180 days after sign-up. Daily cap: 50 pts.
            </p>
            <p className="text-sm">Subject to change in our discretion.</p>
          </div>
        </div>
      )}
    </OuterBox>
  );
};
