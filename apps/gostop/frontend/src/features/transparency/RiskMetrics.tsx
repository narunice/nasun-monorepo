/**
 * RiskMetrics — Tier 1.3 Public Risk Dashboard primary panel.
 *
 * Surfaces TVL, the PnL trio (24h/7d/30d), pending exposure, utilization
 * ratio vs on-chain cap, largest single payout, and cumulative LP yield.
 * Tone: DeFi-protocol risk page, not casino dashboard. DESIGN.md "Bellagio"
 * restraint — no neon, no emoji, gold accents only where they earn their keep.
 *
 * Honest naming guard rails:
 *   - Open exposure (max liability) uses chain-authoritative bankroll_pool
 *     v0.0.4 open_exposure. When `active_exposure_chain_status === 'dormant'`
 *     (v0.0.4 published but dependent game contracts still linkage-frozen
 *     to v0.0.2/v0.0.3, lockstep upgrade pending) we render a provisional
 *     placeholder instead of a misleading 0. When it is 'degraded' the reserved
 *     total exceeds pool.balance, so both this cell and Utilization (which
 *     divides by the same numerator) withhold rather than publish a number
 *     that reads like a risk measurement. The UI does not attribute a cause:
 *     a leaked ledger and a genuinely over-committed pool both land here, and
 *     the backend enum docs carry that distinction.
 *   - "Cumulative LP yield" allows negative values when the pool is
 *     underwater; the sign is preserved.
 */

import type { DataQuality, RiskMetricsBlock, RiskWindowPnl } from '../../lib/api/types';
import { bpsToPct, fmtUsdc, fmtUsdcSigned } from '../dashboard/format';

interface Props {
  risk: RiskMetricsBlock;
}

function qualityClass(q: DataQuality, fallback = 'text-neutral-100'): string {
  if (q === 'unreliable') return 'text-neutral-400';
  return fallback;
}

function netPnlClass(raw: string, q: DataQuality): string {
  if (q === 'unreliable') return 'text-neutral-400';
  try {
    return BigInt(raw) >= 0n ? 'text-emerald-300' : 'text-rose-300';
  } catch {
    return 'text-neutral-100';
  }
}

function fmtPnlValue(w: RiskWindowPnl): string {
  if (w.data_quality === 'unreliable') return '—';
  return `${fmtUsdcSigned(w.net_pnl_raw)} NUSDC`;
}

function utilizationLabel(bps: number, q: DataQuality, measurable: boolean): string {
  if (q === 'unreliable' || !measurable) return '—';
  return bpsToPct(bps);
}

function capLabel(capBps: number | null): { value: string; note: string } {
  if (capBps === null) {
    return { value: 'No cap', note: 'No utilization cap has been configured on chain.' };
  }
  if (capBps === 0) {
    return { value: 'Disabled', note: 'Utilization cap is currently disabled (admin set cap_bps=0).' };
  }
  return { value: bpsToPct(capBps), note: 'On-chain advisory cap. Rounds rejected when ratio exceeds this value.' };
}

export function RiskMetrics({ risk }: Props) {
  const unreliable = risk.data_quality === 'unreliable';
  const tvlDisplay = unreliable ? '—' : `${fmtUsdc(risk.tvl_raw)} NUSDC`;
  const cap = capLabel(risk.utilization_cap_bps);
  // chain_status='dormant' means v0.0.4 is published but the dependent game
  // contracts are still linkage-frozen to v0.0.2/v0.0.3. The raw value will
  // be 0 (or stale) and must not be rendered as if it were a chain reading.
  const exposureDormant = risk.active_exposure_chain_status === 'dormant';
  // chain_status='degraded' means the reservation ledger has drifted past
  // pool.balance, which the reserve/release model cannot do while its pairing
  // holds. See the backend enum docs for the paths that break it in each
  // direction. The number is still a chain reading, it just is not a
  // liability any more.
  const exposureDegraded = risk.active_exposure_chain_status === 'degraded';
  // Utilization divides by pool.balance but its numerator is this same
  // exposure figure, so it inherits the same unusability.
  const exposureUsable = !exposureDormant && !exposureDegraded;
  const utilDisplay = utilizationLabel(risk.utilization_ratio_bps, risk.data_quality, exposureUsable);
  // Branch on the same three cases the value does. Blanking the number while
  // the tooltip still described a working measurement would leave the dash
  // unexplained, which is the failure mode this panel exists to avoid.
  const utilHint = exposureDegraded
    ? 'Not currently measurable. Utilization is open exposure over pool balance, and open exposure currently exceeds that balance, so the ratio does not describe house risk. Restored once the reserved total is back under the pool balance.'
    : exposureDormant
      ? 'Not currently measurable. Utilization is open exposure over pool balance, and no recent on-chain exposure reading is available, so there is no numerator to divide. Restored once the dependent game contracts are rebound to bankroll_pool v0.0.4.'
      : 'Pending round commitments as a share of pool balance. Live commitments include rounds awaiting resolution or claim.';
  const exposureLabel = exposureDormant
    ? 'Open exposure (provisional)'
    : exposureDegraded
      ? 'Open exposure (unavailable)'
      : 'Open exposure (max liability)';
  const exposureDisplay = unreliable || !exposureUsable
    ? '—'
    : `${fmtUsdc(risk.active_exposure_raw)} NUSDC`;
  const exposureHint = exposureDormant
    ? 'Awaiting v0.0.4 lockstep upgrade across dependent game contracts. The on-chain open_exposure dynamic field has not yet been initialized, so this number is provisional and rendered as a placeholder rather than a misleading 0 NUSDC. Will reflect chain truth once each game contract is rebound to bankroll_pool v0.0.4.'
    : exposureDegraded
      ? 'Withheld rather than shown as a liability it does not represent. Each bet reserves the game maximum payout against the pool and releases it when the round settles, and the reserved total currently exceeds the pool balance, so it is not a measure of house liability either way. Player funds and payouts are unaffected: every payout is independently bounded by the pool balance check in pay_winner.'
      : 'Chain-authoritative reading of bankroll_pool.open_exposure: sum of max_single_payout reserved across all in-flight rounds. Released back when each round settles via pay_winner or refund_bet. This is true max house liability, not a proxy.';
  const largestPayoutDisplay = unreliable ? '—' : `${fmtUsdc(risk.largest_single_payout_raw)} NUSDC`;
  const lpDistDisplay = unreliable ? '—' : `${fmtUsdcSigned(risk.cumulative_lp_distributions_raw)} NUSDC`;

  return (
    <div className="space-y-5">
      {/* Primary trio + TVL */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric
          label="TVL"
          value={tvlDisplay}
          hint="Pool balance from chain at snapshot time."
          valueClass={qualityClass(risk.data_quality, 'text-gold-200')}
        />
        <Metric
          label="Net PnL (24h)"
          value={fmtPnlValue(risk.pnl['24h'])}
          hint="Bets minus payouts and refunds across non-lottery games in the trailing 24 hours."
          valueClass={netPnlClass(risk.pnl['24h'].net_pnl_raw, risk.pnl['24h'].data_quality)}
        />
        <Metric
          label="Net PnL (7d)"
          value={fmtPnlValue(risk.pnl['7d'])}
          hint="Same metric, trailing 7 days. Headline figure for LP-relevant volatility."
          valueClass={netPnlClass(risk.pnl['7d'].net_pnl_raw, risk.pnl['7d'].data_quality)}
        />
        <Metric
          label="Net PnL (30d)"
          value={fmtPnlValue(risk.pnl['30d'])}
          hint="Same metric, trailing 30 days. Long-window context for the 24h and 7d cells."
          valueClass={netPnlClass(risk.pnl['30d'].net_pnl_raw, risk.pnl['30d'].data_quality)}
        />
      </div>

      {/* Utilization + exposure */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Metric
          label="Utilization"
          value={utilDisplay}
          hint={utilHint}
          valueClass={exposureUsable ? qualityClass(risk.data_quality) : 'text-neutral-400'}
        />
        <Metric
          label="Cap (on chain)"
          value={cap.value}
          hint={cap.note}
          valueClass="text-neutral-100"
        />
        <Metric
          label={exposureLabel}
          value={exposureDisplay}
          hint={exposureHint}
          valueClass={exposureUsable ? qualityClass(risk.data_quality) : 'text-neutral-400'}
        />
      </div>

      {/* Headline outcomes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Metric
          label="Largest single payout"
          value={largestPayoutDisplay}
          hint="Biggest single winning round the house has paid out to a player since launch."
          valueClass={qualityClass(risk.data_quality)}
        />
        <Metric
          label="Cumulative LP yield"
          value={lpDistDisplay}
          hint="Approximate yield earned by LPs since seeding: (current pps − 1.0) × total shares. Negative when pool is underwater. Precise historical replay is on the roadmap."
          valueClass={netPnlClass(risk.cumulative_lp_distributions_raw, risk.data_quality)}
        />
      </div>
    </div>
  );
}

function Metric({ label, value, hint, valueClass }: {
  label: string;
  value: string;
  hint: string;
  valueClass: string;
}) {
  return (
    <div className="rounded-lg border border-gold-subtle bg-ink-900/40 p-3.5 space-y-1.5">
      <span
        className="block text-xs uppercase tracking-widest text-neutral-300"
        title={hint}
      >
        {label}
      </span>
      <span className={`block font-mono text-base ${valueClass}`}>{value}</span>
      <p className="text-xs text-neutral-300 leading-relaxed">{hint}</p>
    </div>
  );
}
