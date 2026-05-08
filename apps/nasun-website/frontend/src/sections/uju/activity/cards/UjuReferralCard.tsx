/**
 * UjuReferralCard
 *
 * Referral program card for the UJU Activity tab. Shows the user's referral
 * code (premium, 10/10) when the eligibility gate passes, or a static
 * explanation when the user has not yet qualified.
 */

import { FC, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth";
import { Spinner } from "@/components/ui";
import {
  getMyReferralCode,
  getMyReferralStats,
  ReferralApiError,
  type ReferralStats,
} from "@/services/referralApi";
import { UjuCard, UjuSectionHeader, UjuButton, UjuStat } from "../../shared";

interface UjuReferralCardProps {
  className?: string;
}

interface NotEligibleInfo {
  hint?: string;
  closestPath?: string;
  adminCuratedBonusTotal?: number;
}

export const UjuReferralCard: FC<UjuReferralCardProps> = ({
  className = "",
}) => {
  const { user } = useAuth();
  const token = user?.cognitoToken;
  const isConfigured = !!import.meta.env.VITE_REFERRAL_API;

  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [notEligible, setNotEligible] = useState<NotEligibleInfo | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

    getMyReferralStats(token)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {
        // non-fatal
      });

    getMyReferralCode(token)
      .then((res) => {
        if (cancelled) return;
        setReferralCode(res.referralCode);
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
        if (!cancelled) setIsLoading(false);
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
    const text = `Join me on Nasun — a new L1 blockchain with finance, gaming, AI, and more. Devnet is live.\n\n${referralLink}`;
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [referralLink]);

  const header = (
    <UjuSectionHeader
      accent
      title="Referral Program"
      subtitle="Invite users and earn ecosystem points together"
    />
  );

  // Not signed in
  if (!token) {
    return (
      <UjuCard className={className}>
        {header}
        <p className="text-uju-secondary text-base py-2">
          Sign in to access the referral program.
        </p>
      </UjuCard>
    );
  }

  if (!isConfigured) {
    return (
      <UjuCard className={className}>
        {header}
        <p className="text-uju-secondary text-base py-2">
          Referral program coming soon.
        </p>
      </UjuCard>
    );
  }

  if (isLoading) {
    return (
      <UjuCard className={className}>
        {header}
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      </UjuCard>
    );
  }

  if (pending) {
    return (
      <UjuCard className={className}>
        {header}
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <Spinner />
          <p className="text-sm text-uju-secondary">Checking eligibility...</p>
        </div>
      </UjuCard>
    );
  }

  if (notEligible) {
    return (
      <UjuCard className={className}>
        {header}
        <div className="space-y-3">
          <p className="text-base text-white/90">
            Referral codes are limited during devnet. You can earn one by:
          </p>
          <ul className="text-sm text-uju-secondary space-y-1.5 list-disc pl-5">
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
            <p className="text-sm text-uju-secondary pt-2 border-t border-uju-border/40">
              Your admin-curated bonus points:{" "}
              {notEligible.adminCuratedBonusTotal}
            </p>
          )}
          {notEligible.hint && (
            <p className="text-sm text-pado-2">{notEligible.hint}</p>
          )}
        </div>
      </UjuCard>
    );
  }

  if (error) {
    return (
      <UjuCard className={className}>
        {header}
        <p className="text-rose-300 text-base py-2">
          Failed to load referral data.
        </p>
      </UjuCard>
    );
  }

  return (
    <UjuCard className={className}>
      {header}

      {referralCode && (
        <div className="mb-5">
          <p className="text-sm text-uju-secondary mb-2">Your referral code</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-900/60 border border-uju-border/50 px-3 py-2 rounded text-white font-mono text-lg tracking-widest text-center">
              {referralCode}
            </code>
            <UjuButton onClick={handleCopy} variant="primary">
              {copied ? "Copied!" : "Copy Link"}
            </UjuButton>
            <UjuButton onClick={handleShareX} variant="secondary">
              Share on X
            </UjuButton>
          </div>
        </div>
      )}

      {stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <UjuStat
              label="Invited"
              value={stats.totalReferrals}
              align="center"
            />
            <UjuStat
              label="Active"
              value={stats.activatedCount}
              align="center"
              tone="mint"
            />
            <UjuStat
              label="Bonus Pts"
              value={
                stats.bonusStats?.totalBonusPoints?.toLocaleString("en-US") ??
                "0"
              }
              align="center"
              tone="amber"
            />
          </div>

          {stats.referredBy && (
            <p className="text-sm text-uju-secondary text-center pt-1 border-t border-uju-border/40">
              Referred on{" "}
              {new Date(stats.referredBy.appliedAt).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric" },
              )}
            </p>
          )}

          <div className="text-uju-secondary pt-2 border-t border-uju-border/40 space-y-1">
            <p className="text-sm">
              Earn 10% of your referrals' on-chain activity. Referred users also
              earn 10%.
            </p>
            <p className="text-sm">
              Bonuses are active for 180 days after sign-up. Daily cap: 50 pts.
            </p>{" "}
            <p className="text-sm">Subject to change in our discretion.</p>
          </div>
        </div>
      )}
    </UjuCard>
  );
};
