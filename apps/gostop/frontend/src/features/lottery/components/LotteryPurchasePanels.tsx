import { useEffect, useState } from "react";
import { LOTTERY_MAX_NUMBER, LOTTERY_NUMBERS_COUNT } from "../../../lib/gostop-config";
import { Spinner } from "../../../components/shared/GameUI";

export function PickPanel({
  picks,
  onToggle,
  onQuickPick,
  onClear,
  quickPickSeed,
}: {
  picks: number[];
  onToggle: (n: number) => void;
  onQuickPick: () => void;
  onClear: () => void;
  quickPickSeed: number;
}) {
  return (
    <div className="panel p-7">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="font-display text-2xl text-gold">Your Numbers</h2>
        <div className="flex items-center gap-2">
          <button onClick={onQuickPick} className="btn-ghost !py-2 !px-4 text-sm">
            Quick Pick
          </button>
          <button
            onClick={onClear}
            disabled={picks.length === 0}
            className="btn-ghost !py-2 !px-4 text-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>

      <div key={quickPickSeed} className="grid grid-cols-5 gap-2 justify-items-center">
        {Array.from({ length: LOTTERY_MAX_NUMBER }, (_, i) => i + 1).map((n) => {
          const selected = picks.includes(n);
          return (
            <button
              key={n}
              onClick={() => onToggle(n)}
              className={`number-ball ${selected ? "is-selected" : ""}`}
              aria-pressed={selected}
            >
              {n}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between text-sm text-neutral-200">
        <span>
          Selected <span className="text-gold-200 font-semibold">{picks.length}</span> / {LOTTERY_NUMBERS_COUNT}
        </span>
        <span>Range 1–{LOTTERY_MAX_NUMBER}</span>
      </div>
    </div>
  );
}

export function BuyPanel({
  picks,
  canBuy,
  onBuy,
  isBuying,
  isWalletConnected,
  isRoundOpen,
}: {
  picks: number[];
  canBuy: boolean;
  onBuy: () => void;
  isBuying: boolean;
  isWalletConnected: boolean;
  isRoundOpen: boolean;
}) {
  let label = "Buy Ticket";
  let title = `Pick ${LOTTERY_NUMBERS_COUNT} numbers first`;
  if (!isWalletConnected) {
    label = "Connect Wallet";
    title = "Connect a wallet to buy tickets";
  } else if (!isRoundOpen) {
    label = "Round Closed";
    title = "No open round at the moment";
  } else if (isBuying) {
    label = "Buying...";
    title = "Submitting transaction";
  } else if (canBuy) {
    title = "Submit on-chain ticket purchase";
  }

  return (
    <div className="panel p-7 flex flex-col">
      <h2 className="font-display text-2xl text-gold mb-5">Checkout</h2>

      <div className="flex items-center gap-2 mb-6 min-h-[52px] flex-wrap">
        {picks.length === 0 ? (
          <span className="text-neutral-200 italic text-base">No numbers selected yet.</span>
        ) : (
          picks.map((n) => (
            <span key={n} className="number-ball is-selected !w-10 !h-10 !text-base">
              {n}
            </span>
          ))
        )}
      </div>

      <dl className="space-y-3 text-base border-t border-gold-subtle pt-5">
        <div className="flex items-center justify-between">
          <dt className="text-neutral-200">Ticket price</dt>
          <dd>
            <span className="font-mono text-gold-200">5.00 NUSDC</span>
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-neutral-200">Network</dt>
          <dd>
            <span className="font-mono text-neutral-200">Nasun Devnet</span>
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-neutral-200">Max prize</dt>
          <dd>
            <span className="font-mono text-gold-200">Jackpot (5-of-5)</span>
          </dd>
        </div>
      </dl>

      <button
        onClick={onBuy}
        disabled={!canBuy}
        className="btn-gold mt-6 inline-flex items-center justify-center gap-2"
        title={title}
      >
        {isBuying && <Spinner className="h-4 w-4" />}
        {label}
      </button>
    </div>
  );
}

export function QuickBuyPanel({
  onQuickBuy,
  isBuying,
  isWalletConnected,
  isRoundOpen,
}: {
  onQuickBuy: (count: number) => void;
  isBuying: boolean;
  isWalletConnected: boolean;
  isRoundOpen: boolean;
}) {
  const options = [1, 5, 10];
  const disabled = !isWalletConnected || !isRoundOpen || isBuying;
  const hint = !isWalletConnected
    ? "Connect a wallet to buy tickets"
    : !isRoundOpen
      ? "No open round at the moment"
      : isBuying
        ? "Submitting transaction"
        : "Auto-picks 5 unique numbers per ticket and buys in one transaction";

  // Track which specific quantity the user clicked so the spinner shows
  // only on that button. Without this the parent's `isBuying` flag would
  // light up the spinner on all three Buy buttons simultaneously and the
  // user loses track of which count they actually triggered.
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  useEffect(() => {
    if (!isBuying) setPendingCount(null);
  }, [isBuying]);

  return (
    <section className="panel p-7">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-5">
        <div>
          <h2 className="font-display text-2xl text-gold">Quick Buy</h2>
          <p className="text-sm text-neutral-200 mt-1">Skip picking. Auto-generate numbers and buy instantly.</p>
        </div>
        <p className="text-sm text-neutral-200">5.00 NUSDC each</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {options.map((n) => {
          const thisPending = isBuying && pendingCount === n;
          return (
            <button
              key={n}
              onClick={() => {
                // Re-entry guard: parent's `isBuying` flips asynchronously,
                // so between the click and the parent commit there's a
                // window where a second rapid click would queue another
                // tx. Local pendingCount short-circuits that race.
                if (pendingCount !== null) return;
                setPendingCount(n);
                onQuickBuy(n);
              }}
              disabled={disabled || pendingCount !== null}
              className="btn-ghost !py-3 !px-5 text-sm disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center gap-2"
              title={hint}
            >
              {thisPending && <Spinner className="h-4 w-4" />}
              <span className="font-semibold">Buy {n}</span>
              <span className="ml-2 font-mono text-gold-200">{(n * 5).toFixed(2)} NUSDC</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
