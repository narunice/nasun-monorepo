// HyperliquidPositionsCard
//
// Read-only Hyperliquid positions summary for the uju dashboard. Surfaces
// what a user needs to glance at "do I have anything open on Hyperliquid":
// open perp count + total notional + unrealized PnL (color-coded), plus
// non-zero spot balance count. Per-position drill-down is intentionally
// deferred to a follow-up modal PR.
//
// The parent section hides this card entirely when the user has zero
// activity (perpCount=0 AND spotCount=0); empty cards add noise without
// information for the long tail of users who have never used Hyperliquid.

import { UjuButton, UjuCard } from "../../shared";
import { HYPERLIQUID_PORTFOLIO_URL } from "./hyperliquidConfig";
import { useHyperliquidPositionsSummary } from "./useHyperliquidPositionsSummary";

function formatUsd(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  return `${sign}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedUsd(amount: number): string {
  if (amount > 0) return `+${formatUsd(amount)}`;
  return formatUsd(amount);
}

interface HyperliquidPositionsCardProps {
  evmAddress: `0x${string}`;
}

export function HyperliquidPositionsCard({
  evmAddress,
}: HyperliquidPositionsCardProps) {
  const summary = useHyperliquidPositionsSummary();
  const {
    isLoading,
    perpCount,
    totalNotionalUsd,
    unrealizedPnlUsd,
    spotCount,
    error,
  } = summary;

  const hasPerps = perpCount > 0;
  const hasSpot = spotCount > 0;
  const portfolioUrl = `${HYPERLIQUID_PORTFOLIO_URL}/${evmAddress}`;

  const pnlColorClass =
    unrealizedPnlUsd > 0
      ? "text-emerald-500"
      : unrealizedPnlUsd < 0
        ? "text-rose-500"
        : "text-uju-secondary";

  return (
    <UjuCard>
      <div className="flex items-start justify-between gap-4">
        <span className="text-lg font-semibold text-uju-primary">
          Hyperliquid
        </span>
        <UjuButton
          as="a"
          href={portfolioUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="ghost"
          size="sm"
        >
          Open Hyperliquid
        </UjuButton>
      </div>

      <div className="mt-5 flex flex-col divide-y divide-uju-border/40">
        <PositionRow
          label="Perp Positions"
          countText={
            isLoading
              ? "—"
              : error
                ? "—"
                : hasPerps
                  ? `${perpCount} open`
                  : "None open"
          }
          valueText={
            isLoading || error || !hasPerps
              ? ""
              : `${formatUsd(totalNotionalUsd)} notional`
          }
        />
        {hasPerps && !isLoading && !error && (
          <PositionRow
            label="Unrealized PnL"
            countText={formatSignedUsd(unrealizedPnlUsd)}
            countClassName={pnlColorClass}
            valueText=""
          />
        )}
        <PositionRow
          label="Spot Balances"
          countText={
            isLoading
              ? "—"
              : error
                ? "—"
                : hasSpot
                  ? `${spotCount} held`
                  : "None"
          }
          valueText=""
        />
      </div>
    </UjuCard>
  );
}

interface PositionRowProps {
  label: string;
  countText: string;
  valueText: string;
  countClassName?: string;
}

function PositionRow({
  label,
  countText,
  valueText,
  countClassName,
}: PositionRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className="text-base text-uju-secondary">{label}</span>
      <div className="flex items-baseline gap-3 tabular-nums text-uju-primary">
        <span
          className={`text-base font-medium ${countClassName ?? ""}`.trim()}
        >
          {countText}
        </span>
        {valueText && (
          <span className="text-sm text-uju-secondary">{valueText}</span>
        )}
      </div>
    </div>
  );
}
