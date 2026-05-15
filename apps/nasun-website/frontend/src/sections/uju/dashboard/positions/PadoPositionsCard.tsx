// PadoPositionsCard
//
// Ecosystem-positions surface for Pado. Shows just the summary counts the
// user needs to know "do I have anything open on Pado right now":
// prediction bets and spot DeepBook orders today; perp and lending land
// once those products launch publicly. TP/SL is not part of "spot orders"
// here — see the rationale in usePadoSpotOrdersSummary.ts.

import { UjuButton, UjuCard } from "../../shared";
import {
  formatNusdcAsUsd,
  usePadoPredictionSummary,
} from "./usePadoPredictionSummary";
import {
  formatUsdNumber,
  usePadoSpotOrdersSummary,
} from "./usePadoSpotOrdersSummary";

const PADO_URL = "https://pado.finance";

export function PadoPositionsCard() {
  const prediction = usePadoPredictionSummary();
  const spot = usePadoSpotOrdersSummary();

  const hasPrediction = prediction.count > 0;
  const hasSpot = spot.count > 0;

  return (
    <UjuCard>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-uju-primary">Pado</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-pado-3/15 px-2.5 py-0.5 text-sm text-pado-4">
            <span className="size-1.5 rounded-full bg-pado-4" aria-hidden />
            Active
          </span>
        </div>
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
          label="Prediction Bets"
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
                ? `${spot.count} open`
                : "None open"
          }
          // Asks lock base tokens (NBTC etc.) and would need a price oracle
          // to render in dollars, so we only expose bid-side NUSDC for now.
          valueText={
            spot.isLoading || !hasSpot || spot.bidLockedNusdc <= 0
              ? ""
              : `${formatUsdNumber(spot.bidLockedNusdc)} locked`
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
  muted?: boolean;
}

function PositionRow({ label, countText, valueText, muted = false }: PositionRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span
        className={`text-base ${muted ? "text-uju-secondary/70" : "text-uju-secondary"}`}
      >
        {label}
      </span>
      <div
        className={`flex items-baseline gap-3 tabular-nums ${
          muted ? "text-uju-secondary/70" : "text-uju-primary"
        }`}
      >
        <span className="text-base font-medium">{countText}</span>
        {valueText && (
          <span className="text-sm text-uju-secondary">{valueText}</span>
        )}
      </div>
    </div>
  );
}
