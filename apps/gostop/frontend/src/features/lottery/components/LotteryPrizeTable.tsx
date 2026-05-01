const TIERS = [
  { tier: "Jackpot", match: "5 of 5", share: "42.0%", color: "text-gold-200" },
  { tier: "Second", match: "4 of 5", share: "17.5%", color: "text-gold-100" },
  { tier: "Third", match: "3 of 5", share: "10.5%", color: "text-gold-50" },
  { tier: "Rollover", match: "-", share: "20.0%", color: "text-emerald-400" },
  { tier: "Bankroll", match: "-", share: "10.0%", color: "text-emerald-400" },
];

export function PrizeTable() {
  return (
    <section className="panel p-5 sm:p-7">
      <h2 className="font-display text-2xl text-gold mb-5">Prize Distribution</h2>
      <div className="overflow-x-auto rounded-lg border border-gold-subtle">
        <table className="w-full min-w-[18rem] text-sm sm:text-base">
          <thead className="bg-ink-800/80 text-sm uppercase tracking-widest text-neutral-200">
            <tr>
              <th className="text-left px-3 sm:px-4 py-3">Tier</th>
              <th className="text-left px-3 sm:px-4 py-3">Match</th>
              <th className="text-right px-3 sm:px-4 py-3">Share of Pool</th>
            </tr>
          </thead>
          <tbody>
            {TIERS.map((t) => (
              <tr key={t.tier} className="border-t border-gold-subtle/50">
                <td className={`px-3 sm:px-4 py-3 font-display text-base sm:text-lg ${t.color}`}>{t.tier}</td>
                <td className="px-3 sm:px-4 py-3 text-neutral-200">{t.match}</td>
                <td className="px-3 sm:px-4 py-3 text-right font-mono text-gold-200">{t.share}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-neutral-200 mt-4 italic">
        Prize pool split: 70% to winners (tiered), 20% rolls to next round, 10% to the gostop bankroll.
      </p>
    </section>
  );
}
