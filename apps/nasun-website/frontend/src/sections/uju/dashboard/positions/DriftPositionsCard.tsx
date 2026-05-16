// DriftPositionsCard
//
// Read-only Drift trading snapshot for the uju dashboard. Mirrors the
// Hyperliquid card shape (capital row leads, PnL color-coded) so a user
// can compare USD parked / earned across perps venues at a glance.
//
// The parent section hides this card entirely when the user has zero
// Drift activity (subAccountCount=0 or all-zero values), since empty
// cards add noise without information for the long tail of users who
// have never touched Drift.
//
// Data source is the Drift Data API /authority/{auth}/snapshots/overview.
// See useDriftPositionsSummary.ts for the API rationale.
//
// Unlike the Hyperliquid card, this component takes no address prop.
// Drift's public dashboard reads the connected wallet itself and the
// snapshots hook resolves the per-app bound authority internally via
// useValidSolanaAddressForApp("drift"), so a prop would only invite
// drift between two truth sources.

import { UjuButton, UjuCard } from "../../shared";
import { DRIFT_APP_URL } from "./driftConfig";
import { useDriftPositionsSummary } from "./useDriftPositionsSummary";

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

export function DriftPositionsCard() {
  const summary = useDriftPositionsSummary();
  const {
    isLoading,
    accountBalanceUsd,
    unrealizedPnlUsd,
    cumulativeRealizedPnlUsd,
    subAccountCount,
    error,
    hasAny,
  } = summary;

  // Hide the card once the fetch settles to an empty/no-activity state.
  // The parent section gates only on isPinned + verified Solana address,
  // so without this self-hide a brand-new authority would render an
  // all-zeros card. Keep the card visible while loading or on error so
  // we don't flash empty content during transient states.
  if (!isLoading && !error && !hasAny) return null;

  const hasUnrealized = unrealizedPnlUsd !== 0;
  const hasRealized = cumulativeRealizedPnlUsd !== 0;

  const unrealizedColorClass =
    unrealizedPnlUsd > 0
      ? "text-emerald-500"
      : unrealizedPnlUsd < 0
        ? "text-rose-500"
        : "text-uju-secondary";

  const realizedColorClass =
    cumulativeRealizedPnlUsd > 0
      ? "text-emerald-500"
      : cumulativeRealizedPnlUsd < 0
        ? "text-rose-500"
        : "text-uju-secondary";

  return (
    <UjuCard>
      <div className="flex items-start justify-between gap-4">
        <span className="text-lg font-semibold text-uju-primary">Drift</span>
        <UjuButton
          as="a"
          href={DRIFT_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          variant="ghost"
          size="sm"
        >
          Open Drift
        </UjuButton>
      </div>

      <div className="mt-5 flex flex-col divide-y divide-uju-border/40">
        <PositionRow
          label="Account Balance"
          countText={isLoading || error ? "—" : formatUsd(accountBalanceUsd)}
          valueText={
            !isLoading && !error && subAccountCount > 0
              ? `${subAccountCount} ${subAccountCount === 1 ? "subaccount" : "subaccounts"}`
              : ""
          }
        />
        {hasUnrealized && !isLoading && !error && (
          <PositionRow
            label="Unrealized PnL"
            countText={formatSignedUsd(unrealizedPnlUsd)}
            countClassName={unrealizedColorClass}
            valueText=""
          />
        )}
        {hasRealized && !isLoading && !error && (
          <PositionRow
            label="Realized PnL (lifetime)"
            countText={formatSignedUsd(cumulativeRealizedPnlUsd)}
            countClassName={realizedColorClass}
            valueText=""
          />
        )}
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
