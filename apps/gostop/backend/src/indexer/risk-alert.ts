/**
 * Risk-alert tick — Tier 1.3 utilization watch (v1).
 *
 * Polls `riskMetrics()` every RISK_ALERT_INTERVAL_MS and, when
 * `active_exposure_chain_status` is 'live', fires a Telegram message on
 * `utilization_ratio_bps > UTILIZATION_THRESHOLD_BPS`. 'degraded' means the
 * ratio's numerator is not a liability, and we report that instead of
 * thresholding it; 'dormant' means there is no recent numerator at all, and we
 * stay silent.
 *
 * Note that 'live' is currently unreachable: risk-metrics classifies every live
 * reading as 'degraded' while RESERVATION_LEDGER_PAIRS_EXACTLY is false, so the
 * threshold rule below is dormant by construction rather than by cadence. That
 * is the intended state. There is no actionable utilization threshold while the
 * instrument producing the numerator is broken, and the branch is kept so it
 * resumes with the same wording once the reservation accounting is fixed.
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

/**
 * Per-key cooldown overrides.
 *
 * 'utilization_unmeasurable' reports a standing condition that only a
 * contract upgrade can clear, not an incident anyone can act on within the
 * hour. Repeating it every 30 min is precisely the pager fatigue that kept
 * the 2026-07-06 NSI outage invisible for seven weeks: the same line went out
 * on a fixed cadence until the channel stopped being read. Daily keeps it
 * present without training the operator to skim past it.
 *
 * Known limit: `lastFired` is in-process, so the first tick after an indexer
 * restart re-fires regardless of how recently the alert went out. That is
 * inherited from the 30-min keys, where losing a cooldown costs half an hour;
 * here it costs a day, so a deploy-heavy session can still produce several
 * copies. Steady state is the 48x reduction that matters, and making it
 * survive restarts needs durable alert state (a table plus a migration),
 * which is deliberately out of scope for an off-chain-only change. Revisit
 * alongside the bankroll_pool upgrade that clears the degraded condition.
 */
const COOLDOWN_OVERRIDE_MS: Partial<Record<AlertKey, number>> = {
  utilization_unmeasurable: 24 * 3_600_000,
};

type AlertKey =
  | 'utilization_high'
  | 'utilization_unmeasurable'
  | 'lp_concentration_extreme';

const lastFired = new Map<AlertKey, number>();

let intervalHandle: NodeJS.Timeout | null = null;



function cooldownFor(key: AlertKey): number {
  return COOLDOWN_OVERRIDE_MS[key] ?? RISK_ALERT_COOLDOWN_MS;
}

function shouldFire(key: AlertKey, now: number): boolean {
  const last = lastFired.get(key);
  if (last === undefined) return true;
  return now - last >= cooldownFor(key);
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

  // utilization_ratio_bps stays arithmetically correct but its numerator is not
  // a liability, so the 60% threshold has nothing to say about it. Report the
  // unusable instrument rather than alerting on its readings.
  //
  // The reservation ledger being unpaired is settled by event counts rather
  // than inferred from the value, so the body may state it (see
  // RESERVATION_LEDGER_PAIRS_EXACTLY). What the counts do not settle is whether
  // the pool is *also* genuinely over-committed: collect_bet's cumulative check
  // runs only when cap_bps > 0 and no cap is configured, so nothing on chain
  // prevents that, and it is a solvency condition rather than an accounting
  // artifact. The body therefore attributes the "not a solvency problem"
  // reading to the dated measurement instead of asserting it of the present.
  if (risk.active_exposure_chain_status === 'degraded') {
    if (shouldFire('utilization_unmeasurable', now)) {
      // State the ratio without characterising it. It sits either side of 100%
      // from hour to hour, and the reason for withholding is the ledger defect
      // rather than any particular value, so an "over 100%" style gloss would
      // be wrong about as often as it was right.
      const ratioLine = risk.tvl_raw === '0'
        ? 'Ratio: n/a (pool balance is zero — nothing backs the reservations)'
        : `Ratio: ${fmtBpsPct(risk.utilization_ratio_bps)} (not a risk ratio, see below)`;
      const text = [
        'GoStop Bankroll — utilization not measurable',
        '',
        `Open exposure: ${risk.active_exposure_raw} NUSDC raw`,
        `Pool balance:  ${risk.tvl_raw} NUSDC raw`,
        ratioLine,
        '',
        'open_exposure is not a house-liability figure and utilization built on it is not a risk ratio. Each reservation needs exactly one matching release and does not get one. Counted over the retained window on 2026-09-27: scratchcard 972,476 reserve against 1,192,865 release, mines 90,217 against 58,135, wheel 229,730 against 103,588, numbermatch 941,009 against 941,009. Releases outnumbering reserves is not something a liability can do.',
        '',
        'Scale at that same measurement: true in-flight liability was at most 150,000 NUSDC (75 live mines sessions at a 2,000 max payout; wheel, scratchcard and numbermatch settle in one transaction and hold nothing at rest; crash has had no round since 2026-05-08) against an open_exposure of 13,720,500, about 91x higher. On that date the gap was accounting, not solvency. Nothing recomputes it, so treat it as the last known reading rather than the current one: the counts prove the ledger is unusable, not that the pool is solvent today. Re-measure before relying on it. Payouts stay bounded independently by the pool balance check in pay_winner.',
        '',
        'Do NOT set a utilization cap. The ratio crosses 100% from hour to hour, and above it no admissible cap exists at all since MAX_CAP_BPS is 10000. Below it a cap still has to clear both the current ratio and each game max_single_payout as a share of balance, or that game aborts on its first bet.',
        '',
        'Clearing this needs the games redeployed with the pairing fixed and open_exposure reset, which takes a bankroll_pool upgrade since it has no admin reset. This alert stands until then; it does not track the value.',
        '',
        `Cooldown ${Math.round(cooldownFor('utilization_unmeasurable') / 3_600_000)} h before re-fire.`,
      ].join('\n');

      const ok = await sendTelegram('risk-alert', text);
      if (ok) {
        lastFired.set('utilization_unmeasurable', now);
        console.log(
          `[risk-alert] utilization_unmeasurable fired at ${fmtBpsPct(risk.utilization_ratio_bps)}`,
        );
      }
    }
  } else if (risk.active_exposure_chain_status === 'dormant') {
    // Same reason the API and the dashboard both render exposure as N/A here:
    // there is no recent on-chain reading, so utilization_ratio_bps has no
    // numerator worth thresholding. Correcting the TVL denominator made this
    // matter — it shrank ~2.7x, so a stale numerator now crosses 60% far more
    // readily than it used to. Stay silent rather than page on it: 'dormant'
    // is an expected standing state (v0.0.4 published, game contracts still
    // linkage-frozen) and the lockstep upgrade that clears it is already
    // tracked, so an alert would add cadence without adding information.
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
  COOLDOWN_OVERRIDE_MS,
};

/** Test-only — resolved per-key cooldown. */
export { cooldownFor as _cooldownFor };
