/**
 * Risk-alert tick — Tier 1.3 utilization watch (v1).
 *
 * Polls `riskMetrics()` every RISK_ALERT_INTERVAL_MS and, when
 * `active_exposure_chain_status` is 'live', fires a Telegram message on
 * `utilization_ratio_bps > UTILIZATION_THRESHOLD_BPS`. 'degraded' means the
 * paired reservations exceed the pool balance, a real over-commitment, and is
 * reported as such rather than thresholded; 'dormant' means there is no recent
 * numerator at all, and we stay silent.
 *
 * v1 ships only the utilization rule (HG2-anchored policy decision); drawdown and
 * 3-sigma volatility alerts are deferred to v1.1 once `bankroll_daily_pnl`
 * has 30+ post-LP-launch days of history to calibrate thresholds against.
 *
 * Why inline in the indexer process (vs separate pm2 cron):
 *   gostop-backend's monorepo ecosystem.config.cjs is drift vs node-3 runtime
 *   (project_gostop_backend_node3_runtime memory). Adding a new pm2 process
 *   would entangle this PR with the deferred PR-C reconcile. A setInterval
 *   hosted by the already-running indexer is observationally identical from
 *   an operations standpoint, sub-second compute cost, and crash-isolated
 *   via try/catch.
 *
 * Cooldown:
 *   Per-key in-memory Map<alertKey, lastFiredMs>. Same alert does not refire
 *   within RISK_ALERT_COOLDOWN_MS. After cooldown lapses, the next breach
 *   above the threshold fires again. Recovery below threshold does NOT send
 *   an "all clear" message in v1 — keep the channel low-noise.
 *
 * Env contract (already declared in env.ts:124-125):
 *   TELEGRAM_BOT_TOKEN     — bot HTTP API token
 *   TELEGRAM_ALERT_CHAT_ID — destination chat id
 *   Either being empty disables alerting entirely (no-op tick). Operator
 *   must set both on node-3 .env before enabling on prod.
 */

import { alertingEnabled, sendTelegram } from './telegram.js';
import { riskMetrics } from '../api/lib/risk-metrics.js';

/** Threshold: utilization above this triggers an alert. HG2-derived policy. */
const UTILIZATION_THRESHOLD_BPS = 6_000; // 60.00%

/** Tick interval — 5 min matches master plan §Tier 1.3 alert cadence. */
const RISK_ALERT_INTERVAL_MS = 5 * 60_000;

/** Per-alert cooldown — prevents pager fatigue when utilization plateaus high. */
const RISK_ALERT_COOLDOWN_MS = 30 * 60_000;

type AlertKey =
  | 'utilization_high'
  | 'exposure_exceeds_balance'
  | 'lp_concentration_extreme';

const lastFired = new Map<AlertKey, number>();

let intervalHandle: NodeJS.Timeout | null = null;



function shouldFire(key: AlertKey, now: number): boolean {
  const last = lastFired.get(key);
  if (last === undefined) return true;
  return now - last >= RISK_ALERT_COOLDOWN_MS;
}

function fmtBpsPct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/**
 * One alerting cycle. Exported for tests + manual invocation.
 */
export async function runRiskAlertOnce(): Promise<void> {
  if (!alertingEnabled()) return;

  let risk;
  try {
    risk = await riskMetrics();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[risk-alert] riskMetrics failed: ${msg}`);
    return;
  }

  // Skip alerting on unreliable data — we'd be firing on garbage. Lagging is
  // fine: numbers are slightly behind but directionally trustworthy.
  if (risk.data_quality === 'unreliable') {
    console.log('[risk-alert] skipping — data_quality=unreliable');
    return;
  }

  const now = Date.now();

  // Since bankroll_pool v0.0.6 every reservation is paired with exactly one
  // release, so open_exposure is the most the open rounds can still pay. It
  // only reads 'degraded' when that exceeds the pool balance, which is a real
  // over-commitment and an incident, not an instrument fault.
  if (risk.active_exposure_chain_status === 'degraded') {
    if (shouldFire('exposure_exceeds_balance', now)) {
      const ratioLine = risk.tvl_raw === '0'
        ? 'Ratio: n/a (pool balance is zero, nothing backs the reservations)'
        : `Ratio: ${fmtBpsPct(risk.utilization_ratio_bps)}`;
      const text = [
        'GoStop Bankroll: open exposure exceeds pool balance',
        '',
        `Open exposure: ${risk.active_exposure_raw} NUSDC raw`,
        `Pool balance:  ${risk.tvl_raw} NUSDC raw`,
        ratioLine,
        '',
        'If every open round paid its maximum, the pool could not cover it. Each payout is still bounded by the balance check in pay_winner, so an uncovered winner would see its payout abort rather than drain the pool, but that is a player-facing failure.',
        '',
        'A utilization cap cannot help above 100%: MAX_CAP_BPS is 10000, so no admissible cap sits above this ratio. Pause new bets (set_paused) or add bankroll.',
        '',
        `Cooldown ${Math.round(RISK_ALERT_COOLDOWN_MS / 60_000)} min before re-fire.`,
      ].join('\n');

      const ok = await sendTelegram('risk-alert', text);
      if (ok) {
        lastFired.set('exposure_exceeds_balance', now);
        console.log(
          `[risk-alert] exposure_exceeds_balance fired at ${fmtBpsPct(risk.utilization_ratio_bps)}`,
        );
      }
    }
  } else if (risk.active_exposure_chain_status === 'dormant') {
    // No usable reading: the chain read failed and there is no recent indexed
    // snapshot to fall back on. Nothing to threshold, and a failing chain read
    // already shows up as data_quality, so stay silent.
    console.log(
      '[risk-alert] utilization skipped — exposure dormant, no usable numerator',
    );
  } else if (risk.utilization_ratio_bps > UTILIZATION_THRESHOLD_BPS) {
    if (shouldFire('utilization_high', now)) {
      // Never phrase a missing cap as a bare invitation to configure one. A
      // cap below max_single_payout / pool.balance for any single game makes
      // that game's very first bet abort, so the floor has to travel with the
      // suggestion.
      const capLine = risk.utilization_cap_bps === null
        ? 'No on-chain cap configured. Any cap must sit above both this ratio and the largest game max_single_payout as a share of pool balance, or that game aborts on every bet.'
        : risk.utilization_cap_bps === 0
          ? 'On-chain cap is currently disabled (cap_bps=0).'
          : `On-chain cap: ${fmtBpsPct(risk.utilization_cap_bps)}`;
      const text = [
        'GoStop Bankroll — utilization high',
        '',
        `Utilization ratio: ${fmtBpsPct(risk.utilization_ratio_bps)} (threshold ${fmtBpsPct(UTILIZATION_THRESHOLD_BPS)})`,
        `Open exposure: ${risk.active_exposure_raw} NUSDC raw`,
        `Pool balance:  ${risk.tvl_raw} NUSDC raw`,
        capLine,
        '',
        `Cooldown ${Math.round(RISK_ALERT_COOLDOWN_MS / 60_000)} min before re-fire.`,
      ].join('\n');

      const ok = await sendTelegram('risk-alert', text);
      if (ok) {
        lastFired.set('utilization_high', now);
        console.log(`[risk-alert] utilization_high fired at ${fmtBpsPct(risk.utilization_ratio_bps)}`);
      }
      // If send failed, do NOT update lastFired — retry on next tick.
    }
  }

  // LP concentration: fire only on 'extreme' (top1 ≥ 80%). 'concentrated'
  // surfaces as a dashboard badge but does not page — most prototypes will
  // sit there for weeks while the LP base broadens, and paging on that band
  // is operationally useless. Recovery does not send "all clear" (same v1
  // low-noise policy as utilization_high).
  if (risk.lp_concentration && risk.lp_concentration.status === 'extreme') {
    if (shouldFire('lp_concentration_extreme', now)) {
      const c = risk.lp_concentration;
      const text = [
        'GoStop Bankroll — single-LP concentration EXTREME',
        '',
        `Rank-1 LP holds: ${fmtBpsPct(c.top1_share_pct_bps)} of all LP shares`,
        `Total positive LP wallets: ${c.lp_count}`,
        '',
        'Risk: this LP\'s withdraw can materially move share_price; on-chain pool resilience depends on a single counterparty.',
        '',
        `Cooldown ${Math.round(RISK_ALERT_COOLDOWN_MS / 60_000)} min before re-fire.`,
      ].join('\n');

      const ok = await sendTelegram('risk-alert', text);
      if (ok) {
        lastFired.set('lp_concentration_extreme', now);
        console.log(`[risk-alert] lp_concentration_extreme fired at top1=${fmtBpsPct(c.top1_share_pct_bps)}`);
      }
    }
  }
}

/**
 * Boot once from the indexer entry. No-op when alerting env is unset, so the
 * indexer can ship the wiring before the operator populates the env on node-3.
 */
export function startRiskAlertLoop(): void {
  if (intervalHandle !== null) return; // idempotent
  if (!alertingEnabled()) {
    console.log('[risk-alert] disabled — TELEGRAM_BOT_TOKEN or TELEGRAM_ALERT_CHAT_ID not set');
    return;
  }
  console.log(
    `[risk-alert] enabled — interval=${RISK_ALERT_INTERVAL_MS / 1000}s cooldown=${RISK_ALERT_COOLDOWN_MS / 60_000}min threshold=${fmtBpsPct(UTILIZATION_THRESHOLD_BPS)}`,
  );
  intervalHandle = setInterval(() => {
    void runRiskAlertOnce();
  }, RISK_ALERT_INTERVAL_MS);
  // Don't keep the event loop alive on shutdown.
  if (typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }
}

/** Test-only — reset cooldown state between specs. */
export function _resetRiskAlertStateForTests(): void {
  lastFired.clear();
}

/** Test-only — exported constants. */
export const _RISK_ALERT_CONSTANTS = {
  UTILIZATION_THRESHOLD_BPS,
  RISK_ALERT_INTERVAL_MS,
  RISK_ALERT_COOLDOWN_MS,
};
