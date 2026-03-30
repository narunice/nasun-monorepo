/**
 * ReferralCard Component
 *
 * Referral program card for the Bento Grid layout.
 * Shows referral code, copy/share buttons, and invitee stats.
 */

import { FC, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/features/auth";
import {
  getMyReferralCode,
  getMyReferralStats,
  type ReferralStats,
} from "@/services/referralApi";
import { OuterBox, Spinner } from "@/components/ui";

interface ReferralCardProps {
  className?: string;
}

export const ReferralCard: FC<ReferralCardProps> = ({ className = "" }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

    Promise.all([getMyReferralCode(token), getMyReferralStats(token)])
      .then(([codeRes, statsRes]) => {
        if (cancelled) return;
        setReferralCode(codeRes.referralCode);
        setStats(statsRes);
      })
      .catch((err) => {
        if (cancelled) return;
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

  const handleShareX = useCallback(() => {
    if (!referralLink) return;
    const text = `Join Nasun and explore the future of decentralized finance!\n\n${referralLink}`;
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
      <OuterBox color="c5" padding="sm" className={className}>
        {title}
        <p className="text-nasun-white/50 text-center text-base py-4">
          Sign in to access the referral program
        </p>
      </OuterBox>
    );
  }

  // API not configured
  if (!isConfigured) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        {title}
        <p className="text-nasun-white/50 text-center text-base py-4">
          Referral program coming soon
        </p>
      </OuterBox>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        {title}
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </OuterBox>
    );
  }

  // Error
  if (error) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        {title}
        <p className="text-red-400 text-base text-center py-4">
          Failed to load referral data
        </p>
      </OuterBox>
    );
  }

  return (
    <OuterBox color="c5" padding="sm" className={className}>
      {title}

      {/* Referral Code + Copy */}
      {referralCode && (
        <div className="mb-4">
          <p className="text-sm text-nasun-white/50 mb-1.5">
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
              <p className="text-sm text-nasun-white/40 uppercase">Invited</p>
            </div>
            <div>
              <p className="text-xl font-bold text-emerald-400">
                {stats.activatedCount}
              </p>
              <p className="text-sm text-nasun-white/40 uppercase">Active</p>
            </div>
            <div>
              <p className="text-xl font-bold text-amber-400">
                {stats.bonusStats?.totalBonusPoints?.toLocaleString("en-US") ??
                  "0"}
              </p>
              <p className="text-sm text-nasun-white/40 uppercase">Bonus Pts</p>
            </div>
          </div>

          {/* Referred by info */}
          {stats.referredBy && (
            <div className="text-sm text-nasun-white/40 text-center pt-1 border-t border-nasun-white/10">
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
          <div className=" text-nasun-white/30 pt-2 border-t border-nasun-white/10 space-y-1">
            <p className="text-sm">
              Earn 10% of your referrals' on-chain activity points. Referred
              users also earn a 5% bonus on their own activities.
            </p>
            <p className="text-sm">
              Bonuses are active for 180 days after sign-up. Daily cap: 50 pts.
            </p>
          </div>
        </div>
      )}
    </OuterBox>
  );
};
