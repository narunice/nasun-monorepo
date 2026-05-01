import { useState } from "react";
import { useAuth } from "@/features/auth";
import { useEcosystemScore } from "@/hooks/useEcosystemScore";
import { useEcosystemStatus } from "@/hooks/useEcosystemStatus";
import { Spinner } from "@/components/ui";
import { UjuCard, UjuSectionHeader } from "../shared";
import { SegmentedDonut } from "./SegmentedDonut";

// Click-to-toggle info popover. Sits in the Health Status header trailing
// slot and explains the decay/recovery rules without forcing them into the
// always-visible UI. Closes on outside click.
function HealthInfoIcon() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Health and boost rules"
        aria-expanded={open}
        className="w-5 h-5 rounded-full border border-uju-border/60 text-uju-secondary hover:text-uju-primary hover:border-pado-2/60 transition-colors flex items-center justify-center text-xs font-semibold leading-none"
      >
        i
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="tooltip"
            className="absolute right-0 top-7 z-50 w-72 rounded-xl border border-uju-border/60 bg-uju-card shadow-2xl p-3 text-sm text-uju-secondary leading-relaxed"
          >
            <p className="text-uju-primary font-semibold mb-2">
              Health &amp; Boost
            </p>
            <p className="mb-2">
              <span className="text-emerald-400 font-medium">
                Alliance Health
              </span>{" "}
              has 4 segments. Each inactive day dims one segment; each active
              day (any mission completion) lights one back up.
            </p>
            <p className="mb-2">
              <span className="text-orange-400 font-medium">
                Genesis Pass Boost
              </span>{" "}
              has 5 segments and follows the same daily replenish rule.
            </p>
            <p>
              GP holders&apos; Alliance Health is locked at 4/4 — Eternal
              Health.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// Segment counts must match backend HEALTH_CONFIG step tables:
//   Alliance: 4 inactive-day steps (100 → 75 → 50 → 25 → 0)
//   GP:       5 inactive-day steps (100 → 80 → 60 → 40 → 20 → 0)
const ALLIANCE_SEGMENTS = 4;
const GP_SEGMENTS = 5;

// Tones — kept in sync with the AllianceBadge / GenesisPassBadge components
// in @nasun/wallet-ui so the donut, badge, and copy read as one identity.
const ALLIANCE_LIT = "stroke-emerald-400";
const ALLIANCE_GLOW = "rgba(52,211,153,0.55)";
const GP_LIT = "stroke-orange-600";
const GP_GLOW = "rgba(234,88,12,0.55)";

// pct ∈ {0, 25, 50, 75, 100} for alliance and {0, 20, 40, 60, 80, 100} for GP.
// `lit` falls out as round(pct / step) so each inactive day removes one
// segment.
function pctToLit(pct: number, segments: number): number {
  const step = 100 / segments;
  return Math.max(0, Math.min(segments, Math.round(pct / step)));
}

// Days until full recovery — equals the number of dim segments. Used in the
// helper text below the donut row.
function daysToFull(pct: number, segments: number): number {
  return Math.max(0, segments - pctToLit(pct, segments));
}

interface HealthDonutSlotProps {
  hasNft: boolean;
  /** When true, slot renders dimmed (e.g. user does not own GP at all). */
  disabled?: boolean;
  percent: number;
  tone: "alliance" | "genesis";
  title: string;
  /** Optional caps subtitle rendered between title and helper (e.g. "Boost"). */
  subtitle?: React.ReactNode;
  /** Center label override (e.g. "Healthy"). */
  centerLabel?: string;
  /** Helper line below the title. ReactNode so callers can render multi-line
   *  copy with mixed colors (e.g. Eternal Health + Genesis Pass Shield). */
  helper?: React.ReactNode;
}

function HealthDonutSlot({
  hasNft,
  disabled = false,
  percent,
  tone,
  title,
  subtitle,
  centerLabel,
  helper,
}: HealthDonutSlotProps) {
  const segments = tone === "alliance" ? ALLIANCE_SEGMENTS : GP_SEGMENTS;
  const litStrokeClass = tone === "alliance" ? ALLIANCE_LIT : GP_LIT;
  const glowColor = tone === "alliance" ? ALLIANCE_GLOW : GP_GLOW;

  const lit = !hasNft || disabled ? 0 : pctToLit(percent, segments);

  let label: string;
  if (disabled) label = "—";
  else if (!hasNft) label = "Locked";
  else if (centerLabel) label = centerLabel;
  else label = `${lit}/${segments}`;

  // Word labels (Healthy / Locked / —) need a smaller font to fit inside
  // the 96px donut without wrapping.
  const isWordLabel = !!centerLabel || !hasNft || disabled;
  const labelClassName = isWordLabel
    ? "text-sm font-semibold"
    : "text-lg font-semibold";

  return (
    <div
      className={`flex items-center gap-3 w-full ${disabled ? "opacity-40" : ""}`}
    >
      <div className="shrink-0">
        <SegmentedDonut
          segments={segments}
          lit={lit}
          litStrokeClass={litStrokeClass}
          glowColor={glowColor}
          label={label}
          labelClassName={labelClassName}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-uju-primary leading-tight">
          {title}
        </p>
        {subtitle && (
          <p className="text-xs uppercase tracking-wider text-uju-secondary/80 leading-tight mt-0.5">
            {subtitle}
          </p>
        )}
        {helper && (
          <p className="text-sm text-uju-secondary mt-1 leading-snug">
            {helper}
          </p>
        )}
      </div>
    </div>
  );
}

interface HealthGaugeCardProps {
  /** Render only the body (no outer UjuCard) for use inside a combined card. */
  bare?: boolean;
}

export function HealthGaugeCard({ bare = false }: HealthGaugeCardProps = {}) {
  const { user } = useAuth();
  const { score, isLoading } = useEcosystemScore(user?.identityId);
  const { getActivation, isLoading: statusLoading } = useEcosystemStatus(
    user?.cognitoToken,
    user?.identityId,
  );

  const wrap = (body: React.ReactNode, extraClass = "") => {
    if (bare)
      return <div className={`flex flex-col w-full ${extraClass}`}>{body}</div>;
    return (
      <UjuCard className={`min-h-[260px] flex flex-col ${extraClass}`}>
        {body}
      </UjuCard>
    );
  };

  const header = (
    <>
      <UjuSectionHeader
        accent
        title="Health Status"
        trailing={<HealthInfoIcon />}
      />
      <p className="text-sm text-uju-secondary -mt-2 mb-3">
        One activity a day replenish.
      </p>
    </>
  );

  // V3 path: backend returns per-NFT health with restDays.
  if (score?.health) {
    const { alliance, genesisPass } = score.health;
    // GP holders' alliance is locked at full per backend rule.
    const alliancePct = genesisPass.hasNft ? 100 : alliance.pct;
    const gpPct = genesisPass.pct;

    const allianceDaysToFull = daysToFull(alliancePct, ALLIANCE_SEGMENTS);
    const gpDaysToFull = daysToFull(gpPct, GP_SEGMENTS);

    // GP holders get a permanent alliance lock — no inactive-day decay.
    // Two-line helper makes it explicit that the 4/4 donut is locked because
    // the Genesis Pass is shielding it (otherwise users could read "Eternal
    // Health" as a generic boast and miss the cause).
    const allianceHelper: React.ReactNode = genesisPass.hasNft ? (
      <>
        <span className="text-emerald-300">Eternal Health</span>
        <br />
        <span className="text-uju-secondary/70">Genesis Pass Shield</span>
      </>
    ) : alliance.hasNft ? (
      alliancePct >= 100 ? undefined : (
        `${allianceDaysToFull} more active day${allianceDaysToFull === 1 ? "" : "s"} to be healthy`
      )
    ) : (
      "Activate to unlock"
    );

    const genesisHelper = genesisPass.hasNft
      ? gpPct >= 100
        ? undefined
        : `${gpDaysToFull} more active day${gpDaysToFull === 1 ? "" : "s"} to get full boost`
      : undefined;

    return wrap(
      <>
        {header}
        <div className="flex-1 flex flex-col items-stretch justify-center gap-3 sm:gap-4">
          <HealthDonutSlot
            hasNft={alliance.hasNft}
            percent={alliancePct}
            tone="alliance"
            title="Alliance"
            helper={allianceHelper}
          />
          <HealthDonutSlot
            hasNft={genesisPass.hasNft}
            disabled={!genesisPass.hasNft}
            percent={gpPct}
            tone="genesis"
            title="Genesis Pass"
            subtitle="Boost"
            helper={genesisHelper}
          />
        </div>
      </>,
    );
  }

  if (isLoading || statusLoading) {
    if (bare) {
      return (
        <div className="flex items-center justify-center py-8 w-full">
          <Spinner size="sm" />
        </div>
      );
    }
    return (
      <UjuCard className="min-h-[260px] flex items-center justify-center">
        <Spinner size="sm" />
      </UjuCard>
    );
  }

  // V1 fallback (pre-cutoff): activation flags only — show all-segments-lit
  // when active, all-dim when inactive.
  const hasAllianceActive = !!getActivation("alliance");
  const hasGenesisActive = !!getActivation("genesis-pass");

  return wrap(
    <>
      {header}
      <div className="flex-1 flex flex-col items-stretch justify-center gap-3 sm:gap-4">
        <HealthDonutSlot
          hasNft={hasAllianceActive || hasGenesisActive}
          percent={hasAllianceActive || hasGenesisActive ? 100 : 0}
          tone="alliance"
          title="Alliance"
          helper={
            hasGenesisActive ? (
              <>
                <span className="text-emerald-300">Eternal Health</span>
                <br />
                <span className="text-uju-secondary/70">
                  Genesis Pass Shield
                </span>
              </>
            ) : hasAllianceActive ? undefined : (
              "Activate to unlock"
            )
          }
        />
        <HealthDonutSlot
          hasNft={hasGenesisActive}
          disabled={!hasGenesisActive}
          percent={hasGenesisActive ? 100 : 0}
          tone="genesis"
          title="Genesis Pass"
          subtitle="Boost"
        />
      </div>
    </>,
  );
}
