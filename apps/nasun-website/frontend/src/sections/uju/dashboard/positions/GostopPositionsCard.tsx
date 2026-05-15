// GostopPositionsCard
//
// Ecosystem-positions surface for GoStop. v1 surfaces only lottery ticket
// count — instant games (scratchcard, crash, mines) settle in the same
// transaction and never leave an "open position" object on-chain, so they
// have nothing to render in a positions card. Pending claimable rewards
// for winning lottery tickets are deliberately deferred; see the rationale
// in useGostopLotterySummary.ts.

import { UjuButton, UjuCard } from "../../shared";
import { GOSTOP_URL } from "./gostopLotteryConfig";
import { useGostopLotterySummary } from "./useGostopLotterySummary";

export function GostopPositionsCard() {
  const lottery = useGostopLotterySummary();
  const hasTickets = lottery.ticketCount > 0;

  return (
    <UjuCard>
      <div className="flex items-start justify-between gap-4">
        <span className="text-lg font-semibold text-uju-primary">GoStop</span>
        <UjuButton
          as="a"
          href={GOSTOP_URL}
          target="_blank"
          rel="noopener noreferrer"
          variant="ghost"
          size="sm"
        >
          Open GoStop
        </UjuButton>
      </div>

      <div className="mt-5 flex flex-col divide-y divide-uju-border/40">
        <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <span className="text-base text-uju-secondary">Lottery Tickets</span>
          <div className="flex items-baseline gap-3 tabular-nums text-uju-primary">
            <span className="text-base font-medium">
              {lottery.isLoading
                ? "—"
                : hasTickets
                  ? `${lottery.ticketCount} held`
                  : "None held"}
            </span>
          </div>
        </div>
      </div>
    </UjuCard>
  );
}
