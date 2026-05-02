import { NM_PAYOUT_TABLE, NM_PRICE_PER_PICK_NUSDC } from '../constants'

export function NMPayoutTable() {
  return (
    <section className="panel p-7">
      <h2 className="font-display text-2xl text-gold mb-5">Payouts</h2>
      <div className="overflow-x-auto rounded-lg border border-gold-subtle">
        <table className="w-full min-w-[28rem] text-sm sm:text-base">
          <thead className="bg-ink-800/80 text-xs sm:text-sm uppercase tracking-widest text-neutral-200">
            <tr>
              <th className="text-left px-3 sm:px-4 py-3">Picks</th>
              <th className="text-left px-3 sm:px-4 py-3">Cost</th>
              <th className="text-left px-3 sm:px-4 py-3">Win</th>
              <th className="text-left px-3 sm:px-4 py-3">Refund</th>
              <th className="text-right px-3 sm:px-4 py-3">Win rate</th>
            </tr>
          </thead>
          <tbody>
            {NM_PAYOUT_TABLE.map((row) => (
              <tr key={row.picks} className="border-t border-gold-subtle/50">
                <td className="px-3 sm:px-4 py-3 font-display text-base sm:text-lg text-gold-200">{row.picks}</td>
                <td className="px-3 sm:px-4 py-3 font-mono text-neutral-200">
                  {(row.picks * NM_PRICE_PER_PICK_NUSDC).toFixed(2)}
                </td>
                <td className="px-3 sm:px-4 py-3 font-mono text-gold-200">{row.win.toFixed(2)}</td>
                <td className="px-3 sm:px-4 py-3 font-mono text-neutral-200">{row.refund.toFixed(2)}</td>
                <td className="px-3 sm:px-4 py-3 text-right font-mono text-gold-200">{row.winRate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-neutral-200 mt-4 italic">
        RTP 80% uniform. Loss refund equals your pick count in NUSDC (20% of cost).
      </p>
    </section>
  )
}
