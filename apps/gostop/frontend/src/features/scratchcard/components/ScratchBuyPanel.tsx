import { Spinner } from "../../../components/shared/GameUI";

const CARD_PRICE_NUSDC = 5;
const BUY_OPTIONS = [1, 3, 5, 10];

export function ScratchBuyPanel({
  onBuy,
  isBuying,
  isWalletConnected,
  buyingCount,
}: {
  onBuy: (count: number) => void;
  isBuying: boolean;
  isWalletConnected: boolean;
  buyingCount: number | null;
}) {
  return (
    <section className="panel p-5 sm:p-7">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display text-2xl text-gold">Buy Cards</h2>
          <p className="text-sm text-neutral-200 mt-1">Each card: {CARD_PRICE_NUSDC.toFixed(2)} NUSDC. RTP 82%.</p>
        </div>
        <p className="text-sm text-neutral-200">Max win 100× = 500 NUSDC</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {BUY_OPTIONS.map((n) => {
          const isThisBuying = buyingCount === n;
          return (
            <button
              key={n}
              onClick={() => onBuy(n)}
              disabled={!isWalletConnected || isBuying}
              className="btn-ghost !py-3 !px-5 text-sm disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center"
              title={
                !isWalletConnected
                  ? "Connect a wallet"
                  : isBuying
                    ? "Submitting transaction"
                    : `Buy ${n} card${n === 1 ? "" : "s"}`
              }
            >
              {isThisBuying && <Spinner className="h-4 w-4 mr-2" />}
              <span className="font-semibold">{isThisBuying ? `Buying ${n}...` : `Buy ${n}`}</span>
              {!isThisBuying && <span className="ml-2 font-mono text-gold-200">{(n * CARD_PRICE_NUSDC).toFixed(2)} NUSDC</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
