const CARD_PRICE_NUSDC = 5;

const PRIZE_TABLE = [
  { mult: 100, probBps: 5, share: "0.05%" },
  { mult: 50, probBps: 15, share: "0.15%" },
  { mult: 20, probBps: 80, share: "0.80%" },
  { mult: 10, probBps: 150, share: "1.50%" },
  { mult: 5, probBps: 300, share: "3.00%" },
  { mult: 2, probBps: 400, share: "4.00%" },
  { mult: 1, probBps: 1550, share: "15.50%" },
];

export function ScratchPrizeTable() {
  return (
    <section className="panel p-7">
      <h2 className="font-display text-2xl text-gold mb-5">Prize Table</h2>
      <div className="overflow-x-auto rounded-lg border border-gold-subtle">
        <table className="w-full min-w-[20rem] text-sm sm:text-base">
          <thead className="bg-ink-800/80 text-xs sm:text-sm uppercase tracking-widest text-neutral-200">
            <tr>
              <th className="text-left px-3 sm:px-4 py-3">Multiplier</th>
              <th className="text-left px-3 sm:px-4 py-3">Prize (NUSDC)</th>
              <th className="text-right px-3 sm:px-4 py-3">Probability</th>
            </tr>
          </thead>
          <tbody>
            {PRIZE_TABLE.map((row) => (
              <tr key={row.mult} className="border-t border-gold-subtle/50">
                <td className="px-3 sm:px-4 py-3 font-display text-base sm:text-lg text-gold-200">{row.mult}×</td>
                <td className="px-3 sm:px-4 py-3 font-mono text-neutral-200">{(row.mult * CARD_PRICE_NUSDC).toFixed(2)}</td>
                <td className="px-3 sm:px-4 py-3 text-right font-mono text-gold-200">{row.share}</td>
              </tr>
            ))}
            <tr className="border-t border-gold-subtle/50">
              <td className="px-3 sm:px-4 py-3 text-neutral-400">No win</td>
              <td className="px-3 sm:px-4 py-3 text-neutral-400">—</td>
              <td className="px-3 sm:px-4 py-3 text-right font-mono text-neutral-400">75.00%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-sm text-neutral-200 mt-4 italic">
        RTP 82% · House edge 18%. Winning cards are minted as NFTs (the prize is paid immediately; the NFT is a collectible
        record).
      </p>
    </section>
  );
}
