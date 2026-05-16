// PadoPositionsCard
//
// Ecosystem-positions surface for Pado. The card now leads with a "Pado
// Balance" Capital row (BM NUSDC + MarginAccount NUSDC) so the user can
// compare capital parked in Pado against other dApps at a glance — see the
// 2026-05-16 handoff for the unification rationale. Activity (prediction
// positions, spot orders) follows as secondary rows.

import { UjuButton, UjuCard } from "../../shared";
import { formatNusdcAsUsd } from "./format";
import { usePadoBalanceSummary } from "./usePadoBalanceSummary";
import { usePadoPredictionSummary } from "./usePadoPredictionSummary";
import { usePadoSpotOrdersSummary } from "./usePadoSpotOrdersSummary";

const PADO_URL = "https://pado.finance";

export function PadoPositionsCard() {
  const balance = usePadoBalanceSummary();
  const prediction = usePadoPredictionSummary();
  const spot = usePadoSpotOrdersSummary();

  const hasBalance = balance.totalNusdcRaw > 0n;
  const hasPrediction = prediction.count > 0;
  const hasSpot = spot.count > 0;

  return (
    <UjuCard>
      <div className="flex items-start justify-between gap-4">
        <span className="text-lg font-semibold text-uju-primary">Pado</span>
        <UjuButton
          as="a"
          href={PADO_URL}
          target="_blank"
          rel="noopener noreferrer"
          variant="ghost"
          size="sm"
        >
          Open Pado
        </UjuButton>
      </div>

      <div className="mt-5 flex flex-col divide-y divide-uju-border/40">
        <PositionRow
          label="Pado Balance"
          countText={
            balance.isLoading
              ? "—"
              : hasBalance
                ? formatNusdcAsUsd(balance.totalNusdcRaw)
                : "$0.00"
          }
          // Base-token (NBTC/NETH/NSOL) balances are not included; see
          // usePadoBalanceSummary for the scope note.
          valueText=""
        />
        <PositionRow
          label="Prediction Positions"
          countText={
            prediction.isLoading
              ? "—"
              : hasPrediction
                ? `${prediction.count} active`
                : "None open"
          }
          valueText={
            prediction.isLoading
              ? ""
              : hasPrediction
                ? `${formatNusdcAsUsd(prediction.totalCostBasis)} staked`
                : ""
          }
        />
        <PositionRow
          label="Spot Orders"
          countText={
            spot.isLoading
              ? "—"
              : hasSpot
                ? `${spot.count}${spot.partial ? "+" : ""} open`
                : spot.partial
                  ? "Open Pado to view"
                  : "None open"
          }
          // Asks lock base tokens (NBTC etc.) and would need a price oracle
          // to render in dollars, so we only expose bid-side NUSDC for now.
          valueText={
            spot.isLoading || !hasSpot || spot.bidLockedNusdcRaw <= 0n
              ? ""
              : `${formatNusdcAsUsd(spot.bidLockedNusdcRaw)} locked`
          }
          countTitle={
            spot.partial
              ? "Your trading history exceeds the dashboard scan window. Open Pado for the authoritative list."
              : undefined
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
