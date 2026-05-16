// AavePositionsCard
//
// Read-only Aave v3 supply/borrow summary for the uju dashboard. Mirrors
// the Hyperliquid card shape (capital row leads, debt row, optional health
// factor row) so a user can compare USD parked across dApps at a glance.
// Multi-chain by design — supplied/borrowed are summed across the five
// primary EVM deployments and the row footnote surfaces which chains are
// active. Per-position breakdown lands in a follow-up.

import { UjuButton, UjuCard } from "../../shared";
import { AAVE_APP_URL } from "./aaveConfig";
import { useAavePositionsSummary } from "./useAavePositionsSummary";

function formatUsd(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  return `${sign}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatHealthFactor(hf: number): string {
  if (!Number.isFinite(hf)) return "—";
  if (hf >= 100) return "100+";
  return hf.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function chainListLabel(
  chains: { chainLabel: string }[],
): string {
  if (chains.length === 0) return "";
  if (chains.length <= 2) return chains.map((c) => c.chainLabel).join(", ");
  return `${chains.length} chains`;
}

export function AavePositionsCard() {
  const summary = useAavePositionsSummary();
  const {
    isLoading,
    totalSuppliedUsd,
    totalBorrowedUsd,
    minHealthFactor,
    activeChains,
    error,
  } = summary;

  const hasDebt = totalBorrowedUsd > 0;
  const hfColorClass =
    minHealthFactor === null
      ? "text-uju-secondary"
      : minHealthFactor < 1.1
        ? "text-rose-500"
        : minHealthFactor < 1.5
          ? "text-amber-500"
          : "text-emerald-500";

  return (
    <UjuCard>
      <div className="flex items-start justify-between gap-4">
        <span className="text-lg font-semibold text-uju-primary">Aave</span>
        <UjuButton
          as="a"
          href={AAVE_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          variant="ghost"
          size="sm"
        >
          Open Aave
        </UjuButton>
      </div>

      <div className="mt-5 flex flex-col divide-y divide-uju-border/40">
        {/* Capital row — matches Hyperliquid "Spot Holdings" and Pado
            "Balance" so the user can compare USD parked in each dApp at a
            glance. The parent section hides the whole card when the user
            has zero Aave activity (hasAny=false). */}
        <PositionRow
          label="Supplied"
          countText={
            isLoading ? "—" : error ? "—" : formatUsd(totalSuppliedUsd)
          }
          valueText={
            !isLoading && !error && activeChains.length > 0
              ? chainListLabel(activeChains)
              : ""
          }
        />
        <PositionRow
          label="Borrowed"
          countText={
            isLoading
              ? "—"
              : error
                ? "—"
                : hasDebt
                  ? formatUsd(totalBorrowedUsd)
                  : "None"
          }
          valueText=""
        />
        {hasDebt && !isLoading && !error && minHealthFactor !== null && (
          <PositionRow
            label="Health Factor"
            countText={formatHealthFactor(minHealthFactor)}
            countClassName={hfColorClass}
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
