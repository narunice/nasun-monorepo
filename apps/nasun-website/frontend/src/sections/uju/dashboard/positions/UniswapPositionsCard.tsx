// UniswapPositionsCard
//
// Read-only Uniswap V3 LP positions summary for the uju dashboard. Mirrors
// the Pado/Gostop card pattern: header + position rows. USD valuation lands
// in a follow-up — tick math + price oracle is non-trivial and the active
// position count is the load-bearing signal for "do I have anything open
// on Uniswap?".

import { UjuButton, UjuCard } from "../../shared";
import { useUniswapPositionsSummary } from "./useUniswapPositionsSummary";

const UNISWAP_URL = "https://app.uniswap.org/positions";

export function UniswapPositionsCard() {
  const summary = useUniswapPositionsSummary();
  const { isLoading, activeCount, totalCount, truncated, error } = summary;

  const hasAny = activeCount > 0;
  const closedCount = Math.max(totalCount - activeCount, 0);

  return (
    <UjuCard>
      <div className="flex items-start justify-between gap-4">
        <span className="text-lg font-semibold text-uju-primary">Uniswap</span>
        <UjuButton
          as="a"
          href={UNISWAP_URL}
          target="_blank"
          rel="noopener noreferrer"
          variant="ghost"
          size="sm"
        >
          Open Uniswap
        </UjuButton>
      </div>

      <div className="mt-5 flex flex-col divide-y divide-uju-border/40">
        <PositionRow
          label="LP Positions"
          countText={
            isLoading
              ? "—"
              : error
                ? "—"
                : hasAny
                  ? `${activeCount}${truncated ? "+" : ""} active`
                  : "None open"
          }
          countTitle={
            truncated
              ? "Showing the first 50 LP NFTs. Open Uniswap for the authoritative list."
              : undefined
          }
          valueText={
            isLoading || error || closedCount === 0
              ? ""
              : `${closedCount} closed`
          }
        />
      </div>
    </UjuCard>
  );
}

interface PositionRowProps {
  label: string;
  countText: string;
  valueText: string;
  countTitle?: string;
}

function PositionRow({ label, countText, valueText, countTitle }: PositionRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className="text-base text-uju-secondary">{label}</span>
      <div className="flex items-baseline gap-3 tabular-nums text-uju-primary">
        <span className="text-base font-medium" title={countTitle}>
          {countText}
        </span>
        {valueText && (
          <span className="text-sm text-uju-secondary">{valueText}</span>
        )}
      </div>
    </div>
  );
}
