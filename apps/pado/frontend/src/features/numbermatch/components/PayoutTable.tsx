/**
 * PayoutTable - Shows odds and payouts for each pick count
 */
import type { FC } from 'react';
import { PAYOUT_TABLE } from '../constants';

export const PayoutTable: FC = () => {
  return (
    <div className="bg-theme-surface rounded-xl border border-theme-border p-4">
      <h4 className="text-sm font-semibold text-theme-text mb-3">Payout Table</h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-theme-text-muted border-b border-theme-border">
            <th className="text-left py-1.5">Picks</th>
            <th className="text-right py-1.5">Cost</th>
            <th className="text-right py-1.5">Win Rate</th>
            <th className="text-right py-1.5">Win</th>
            <th className="text-right py-1.5">Loss</th>
          </tr>
        </thead>
        <tbody>
          {PAYOUT_TABLE.map((row) => (
            <tr key={row.picks} className="border-b border-theme-border/50">
              <td className="py-1.5 font-mono text-theme-text">{row.picks}</td>
              <td className="py-1.5 text-right font-mono text-theme-text">{row.cost}</td>
              <td className="py-1.5 text-right font-mono text-yellow-400">{row.winRate}</td>
              <td className="py-1.5 text-right font-mono text-green-400">+{row.winPayout}</td>
              <td className="py-1.5 text-right font-mono text-red-400/70">-{row.cost - row.lossRefund}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-xs text-theme-text-muted">
        RTP: 80% | Loss refund: 20% of bet
      </div>
    </div>
  );
};
