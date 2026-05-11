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
  getMoreReferees,
  ReferralApiError,
  type ReferralStats,
  type RefereeRow,
} from "@/services/referralApi";
import { UjuCard, UjuSectionHeader, UjuButton, UjuStat } from "../../shared";
import { useAccountLinking } from "@/sections/myAccount/hooks/useAccountLinking";

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
  const [referees, setReferees] = useState<RefereeRow[]>([]);
  const [refereesCursor, setRefereesCursor] = useState<string | null>(null);
  const [refereesLoading, setRefereesLoading] = useState(false);
  // Client-side pagination cap for the legacy fallback path (old Lambda
  // returns ALL referrals inline; we slice locally so the card doesn't
  // grow unboundedly while we wait for the new backend to roll out).
  const [legacyVisibleCount, setLegacyVisibleCount] = useState(20);
  // Detail toggles: separate state per section so a user who is BOTH a
  // referred user AND a referrer can collapse one without affecting the
  // other. Defaults to expanded so first-time viewers see the rules.
  const [selfDetailsOpen, setSelfDetailsOpen] = useState(true);
  const [referrerDetailsOpen, setReferrerDetailsOpen] = useState(true);
  const { handleLinkTwitter, isLinking } = useAccountLinking({
    user: user as never,
  });
  const xLinked = Boolean(user?.twitterId);

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
        if (cancelled) return;
        setStats(s);
        // Seed first page of referees from inline response (avoids 2nd round-trip).
        if (s.referees) {
          setReferees(s.referees.items);
          setRefereesCursor(s.referees.nextCursor);
        }
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

  const handleLoadMoreReferees = useCallback(async () => {
    if (!token || !refereesCursor || refereesLoading) return;
    setRefereesLoading(true);
    try {
      const res = await getMoreReferees(token, refereesCursor);
      setReferees((prev) => [...prev, ...res.items]);
      setRefereesCursor(res.nextCursor);
    } catch {
      // non-fatal: leave existing list intact
    } finally {
      setRefereesLoading(false);
    }
  }, [token, refereesCursor, refereesLoading]);

  const openFollowTab = useCallback(() => {
    window.open("https://x.com/Nasun_io", "_blank", "noopener,noreferrer");
  }, []);

  // Toggle button factory: shared visual style, per-section state. Caret
  // direction reflects the bound open state.
  const buildToggle = (open: boolean, setOpen: (v: boolean) => void) => (
    <button
      onClick={() => setOpen(!open)}
      className="w-full text-sm text-uju-secondary hover:text-nasun-white py-1.5 flex items-center justify-center gap-1.5 transition-colors"
      aria-expanded={open}
    >
      <span>{open ? "Hide details" : "Show details"}</span>
      <span aria-hidden="true">{open ? "▲" : "▼"}</span>
    </button>
  );

  // Shared explainer rendered in both views (referrer + referred). Single
  // source of truth so the rules stay in sync across the two perspectives.
  const bonusExplainer = (
    <div className="text-sm text-uju-secondary space-y-1">
      <p className="text-amber-300/90">
        Referral bonus activates only after admin approves the referee.
        Approval requires the referee to (1) connect X and (2) follow
        @Nasun_io. No 10% bonus is added before approval.
      </p>
      <p>
        Once approved, both the referrer and the referee earn 10% of the
        referee's total daily points (base activity + admin-curated bonuses
        such as creator posts, missions, and repost rewards). Bonuses are
        computed once per UTC day and post the following day.
      </p>
      <p>
        Active for 180 days after admin approval. Daily cap: 50 pts each.
        Subject to change in our discretion.
      </p>
    </div>
  );

  // "I am a referred user" block — bonus activation status. Renders whenever
  // stats.referredBy exists, regardless of whether this user is also eligible
  // to issue their own code. Pure read; uses useAuth/twitterId for X linked.
  const referredSelfBlock = stats?.referredBy ? (
    <div className="space-y-3 mb-5 pb-5 border-b border-uju-border/40">
      <p className="text-sm font-medium text-nasun-white">
        Your referral bonus
      </p>

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-uju-secondary">
          1. Connect your X account
        </div>
        {xLinked ? (
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
            Connected
          </span>
        ) : (
          <button
            onClick={handleLinkTwitter}
            disabled={isLinking}
            className="px-2.5 py-1 rounded bg-nasun-c4/30 hover:bg-nasun-c4/50 text-nasun-white text-sm disabled:opacity-50"
          >
            {isLinking ? "Connecting..." : "Connect"}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-uju-secondary">
          2. Follow @Nasun_io on X
        </div>
        <button
          onClick={openFollowTab}
          className="px-2.5 py-1 rounded bg-nasun-white/5 hover:bg-nasun-white/10 text-nasun-white text-sm"
        >
          Open X
        </button>
      </div>

      {/* Status badge */}
      <div className="pt-2">
        {!xLinked && (
          <span className="text-sm text-amber-400">
            Action required: connect X to start review.
          </span>
        )}
        {xLinked && stats.referredBy.status === "PENDING" && (
          <span className="text-sm text-nasun-white/80">
            Pending review — admin will verify your follow shortly.
          </span>
        )}
        {stats.referredBy.status === "ACTIVATED" &&
          stats.referredBy.activatedAt && (
            <span className="text-sm text-emerald-400">
              Approved — earning 10% bonus since{" "}
              {new Date(stats.referredBy.activatedAt).toLocaleDateString(
                "en-US",
                {
                  month: "short",
                  day: "numeric",
                },
              )}
            </span>
          )}
      </div>

      <div className="pt-3 border-t border-uju-border/30">
        {buildToggle(selfDetailsOpen, setSelfDetailsOpen)}
        {selfDetailsOpen && bonusExplainer}
      </div>
    </div>
  ) : null;

  // "Your referees" list — privacy-first: no handles, no identityIds.
  // Each row is identified only by a stable serial (oldest=1) + apply date.
  // Backend may return rich `referees` (with serial + twitterLinked) or, on
  // an older Lambda, only the anonymous `referrals` (status + dates). In
  // the legacy fallback we synthesize serials in chronological order so
  // the UI shape is identical either way.
  const hasEnriched = referees.length > 0;
  type DisplayRow = {
    serial: number;
    twitterLinked: boolean | null; // null = unknown (legacy backend)
    status: string;
    appliedAt: string;
    activatedAt: string | null;
  };
  const fallbackRows: DisplayRow[] =
    !hasEnriched && stats?.referrals
      ? (() => {
          const ascending = stats.referrals
            .slice()
            .sort(
              (a, b) =>
                (Date.parse(a.appliedAt || "") || 0) -
                (Date.parse(b.appliedAt || "") || 0),
            );
          return ascending
            .map((r, idx) => ({
              serial: idx + 1,
              twitterLinked: null as boolean | null,
              status: r.status,
              appliedAt: r.appliedAt,
              activatedAt: r.activatedAt,
            }))
            .reverse();
        })()
      : [];
  const enrichedRows: DisplayRow[] = hasEnriched
    ? referees.map((r) => ({
        serial: r.serial,
        twitterLinked: r.twitterLinked,
        status: r.status,
        appliedAt: r.appliedAt,
        activatedAt: r.activatedAt,
      }))
    : [];
  // Two pagination paths converge here:
  //   - Enriched (new Lambda): server-side cursor; we render everything in
  //     `referees` and let "Load more" call /referral/my-referees for more.
  //   - Legacy fallback (old Lambda): client-side slice of fallbackRows up
  //     to `legacyVisibleCount`; "Load more" bumps the cap by 20.
  const allDisplayRows = hasEnriched ? enrichedRows : fallbackRows;
  const displayRows = hasEnriched
    ? allDisplayRows
    : allDisplayRows.slice(0, legacyVisibleCount);
  const hasMore = hasEnriched
    ? Boolean(refereesCursor)
    : allDisplayRows.length > legacyVisibleCount;
  const onLoadMore = hasEnriched
    ? handleLoadMoreReferees
    : () => setLegacyVisibleCount((n) => n + 20);

  const refereesBlock =
    referralCode && displayRows.length > 0 ? (
      <div className="space-y-2 mt-5 pt-4 border-t border-uju-border/40">
        <p className="text-sm font-medium text-nasun-white">
          Your referees{" "}
          <span className="text-uju-secondary text-xs font-normal">
            ({allDisplayRows.length}
            {hasEnriched && refereesCursor ? "+" : ""})
          </span>
        </p>
        <ul className="text-sm divide-y divide-uju-border/30">
          {displayRows.map((r) => (
            <li
              key={r.serial}
              className="py-2 flex items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-nasun-white">Referee #{r.serial}</p>
                <p className="text-xs text-uju-secondary">
                  Joined{" "}
                  {r.appliedAt
                    ? new Date(r.appliedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.twitterLinked !== null && (
                  <span
                    className={
                      "text-xs px-2 py-0.5 rounded " +
                      (r.twitterLinked
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-nasun-white/10 text-nasun-white/60")
                    }
                  >
                    {r.twitterLinked ? "X linked" : "X missing"}
                  </span>
                )}
                <span
                  className={
                    "text-xs px-2 py-0.5 rounded " +
                    (r.status === "ACTIVATED"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/20 text-amber-400")
                  }
                >
                  {r.status === "ACTIVATED" ? "Approved" : "Pending"}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={refereesLoading}
            className="w-full mt-2 px-3 py-1.5 rounded bg-nasun-white/5 hover:bg-nasun-white/10 text-nasun-white text-sm disabled:opacity-50"
          >
            {refereesLoading ? "Loading..." : "Load more"}
          </button>
        )}
      </div>
    ) : null;

  const header = (
    <UjuSectionHeader
      accent
      title="Referral Program"
      subtitle="Invite users and earn Nasun points together"
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
        {referredSelfBlock}
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

      {referredSelfBlock}

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

          <div className="pt-2 border-t border-uju-border/40">
            {buildToggle(referrerDetailsOpen, setReferrerDetailsOpen)}
            {referrerDetailsOpen && bonusExplainer}
          </div>
        </div>
      )}

      {referrerDetailsOpen && refereesBlock}
    </UjuCard>
  );
};
