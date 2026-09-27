/**
 * Periodic drift keeper. Watches one condition: did the indexer miss a
 * share-affecting bankroll event.
 *
 * The check is incremental, anchored on gostop.bankroll_shares_checkpoint. Given
 * the chain share count and the newest event id at the last agreement, the
 * chain's movement since then must equal the summed deltas of the events
 * indexed since then. See indexer/shares-checkpoint.ts for why that replaced
 * replaying `bankroll_event.total_shares_after` from genesis, and migration 008
 * for the two failures that made the old basis unusable.
 *
 * This used to carry two more alerts, reconciler_stall_severe and
 * cursor_lag_severe, both measuring the backlog of the reconciler that
 * maintained that running total. With the running total gone there is no such
 * backlog, and the checkpoint comparison subsumes what they were proxying for:
 * an indexer that stops ingesting share events shows up as the chain moving
 * while the deltas do not.
 *
 * Their removal also ends a real problem. cursor_lag_severe fired on "oldest
 * unreconciled row older than 1h", and thirteen rows had been stuck since June
 * because of the scan's forward-only cursor, so the condition was permanently
 * true. The moment its Telegram delivery was fixed on 2026-09-27 it began
 * paging every 30 minutes about a standing state nobody could clear.
 *
 * Why inline in the indexer process (vs separate pm2 cron): same rationale as
 * risk-alert.ts. The indexer is already running, this work is cents on the
 * cycle, and a separate pm2 process would entangle with the node-3
 * ecosystem.config.cjs runtime.
 */

import { sendTelegram, alertingEnabled } from './telegram.js';
import { rpcCall } from '../rpc.js';
import { BANKROLL_POOL } from '../config/contracts.js';
import { advanceCheckpoint, compareShares } from './shares-checkpoint.js';

const DRIFT_KEEPER_INTERVAL_MS = 5 * 60_000;

/**
 * Cooldown for chain_divergence.
 *
 * Longer than the 30 min the retired alerts used, deliberately. The checkpoint
 * never advances over a gap, so an unresolved miss is reported again every
 * cooldown, and a missed share event is not something anyone resolves inside
 * half an hour: it needs a reindex or a manual reconciliation. Six hours keeps
 * a standing gap visible without teaching the operator to skim the channel,
 * which is the failure that kept the 2026-07-06 NSI outage invisible for seven
 * weeks. Onset is still prompt, two ticks after the gap appears.
 */
const DRIFT_KEEPER_COOLDOWN_MS = 6 * 3_600_000;

type AlertKey = 'chain_divergence';

const lastFired = new Map<AlertKey, number>();
let intervalHandle: NodeJS.Timeout | null = null;

function shouldFire(key: AlertKey, now: number): boolean {
  const last = lastFired.get(key);
  if (last === undefined) return true;
  return now - last >= DRIFT_KEEPER_COOLDOWN_MS;
}

async function fetchChainTotalShares(): Promise<bigint | null> {
  try {
    const res = await rpcCall<{
      data?: { content?: { fields?: { total_shares?: string | number } } };
    }>('sui_getObject', [BANKROLL_POOL.bankrollPoolObjectId, { showContent: true }]);
    const ts = res?.data?.content?.fields?.total_shares;
    if (ts === undefined) return null;
    return BigInt(String(ts));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[drift-keeper] sui_getObject failed: ${msg}`);
    return null;
  }
}

/**
 * The gap this tick observed, held so the next tick can decide whether it was
 * real. Null when the previous tick saw no gap.
 */
let pendingDivergence: { chain: bigint; expected: bigint } | null = null;

/**
 * Require a divergence to survive one full interval before paging.
 *
 * The chain and the ledger are read at different instants and the ledger lags,
 * so a chain move that has not been indexed yet looks exactly like a missed
 * event. What separates them is that lag resolves: the next tick's delta sum has
 * grown and the pair differs. A real miss reproduces the same pair, because the
 * checkpoint does not advance over a gap and the missing delta never arrives.
 *
 * An immediate re-read cannot make this distinction, which is why it is two
 * ticks apart rather than two reads.
 *
 * Known limit: `pendingDivergence` is in-process, so an indexer restart between
 * the two observations loses the arming and the gap needs another two ticks.
 */
function confirmDivergence(chain: bigint, expected: bigint): boolean {
  const prev = pendingDivergence;
  pendingDivergence = { chain, expected };
  if (prev === null || prev.chain !== chain || prev.expected !== expected) {
    console.log(
      '[drift-keeper] divergence armed, awaiting confirmation next tick ' +
        `(chain=${chain} expected=${expected})`,
    );
    return false;
  }
  return true;
}

/** Clear the latch once the two sides agree again. */
function clearPendingDivergence(): void {
  if (pendingDivergence !== null) {
    console.log('[drift-keeper] divergence cleared, chain and ledger agree');
    pendingDivergence = null;
  }
}

/**
 * One drift-keeper cycle. Exported for tests + manual invocation.
 */
export async function runDriftKeeperOnce(): Promise<void> {
  if (!alertingEnabled()) return;

  const chainShares = await fetchChainTotalShares();
  if (chainShares === null) return;

  const poolObjectId = BANKROLL_POOL.bankrollPoolObjectId;

  let cmp;
  try {
    cmp = await compareShares(poolObjectId, chainShares);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[drift-keeper] compareShares failed: ${msg}`);
    return;
  }

  // Null means this tick anchored a fresh checkpoint instead of comparing. That
  // happens once per pool object, so a fresh genesis starts its own series
  // rather than inheriting the retired chain's.
  if (cmp === null) return;

  if (cmp.expectedShares === chainShares) {
    clearPendingDivergence();
    try {
      await advanceCheckpoint(poolObjectId, chainShares, cmp.latestEventId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[drift-keeper] advanceCheckpoint failed: ${msg}`);
    }
    return;
  }

  if (!confirmDivergence(chainShares, cmp.expectedShares)) return;

  const now = Date.now();
  if (!shouldFire('chain_divergence', now)) return;

  const gap = chainShares - cmp.expectedShares;
  const text = [
    'GoStop Bankroll: chain divergence',
    '',
    `Chain total_shares: ${chainShares.toString()}`,
    `Expected from ledger: ${cmp.expectedShares.toString()}`,
    `Gap: ${gap.toString()}`,
    '',
    `Checkpoint: ${cmp.checkpointShares.toString()} shares at event id ${cmp.checkpointEventId.toString()}`,
    `Deltas indexed since: ${cmp.deltaSinceCheckpoint.toString()} over ids up to ${cmp.latestEventId.toString()}`,
    `Pool object: ${poolObjectId}`,
    '',
    'The chain moved by more or less than the share events indexed since the last agreement, and the same pair held across two checks '
      + `${Math.round(DRIFT_KEEPER_INTERVAL_MS / 60_000)} min apart, so this is not indexer lag. A share event was missed, a cursor was reset, or the chain rolled back.`,
    '',
    'The checkpoint deliberately does not advance over a gap, so this keeps reporting until the ledger is reconciled. Investigate before clearing it.',
    '',
    `Cooldown ${Math.round(DRIFT_KEEPER_COOLDOWN_MS / 3_600_000)} h before re-fire.`,
  ].join('\n');

  if (await sendTelegram('drift-keeper', text)) {
    lastFired.set('chain_divergence', now);
    console.log(
      `[drift-keeper] chain_divergence fired (chain=${chainShares} expected=${cmp.expectedShares} gap=${gap})`,
    );
  }
}

/**
 * Boot from indexer entry. No-op when alerting env is unset; idempotent.
 */
export function startDriftKeeperLoop(): void {
  if (intervalHandle !== null) return;
  if (!alertingEnabled()) {
    console.log('[drift-keeper] disabled, TELEGRAM_BOT_TOKEN or TELEGRAM_ALERT_CHAT_ID not set');
    return;
  }
  console.log(
    `[drift-keeper] enabled, interval=${DRIFT_KEEPER_INTERVAL_MS / 1000}s cooldown=${DRIFT_KEEPER_COOLDOWN_MS / 3_600_000}h`,
  );
  intervalHandle = setInterval(() => {
    void runDriftKeeperOnce();
  }, DRIFT_KEEPER_INTERVAL_MS);
  if (typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }
}

/** Test-only. Resets cooldown and latch state between specs. */
export function _resetDriftKeeperStateForTests(): void {
  lastFired.clear();
  pendingDivergence = null;
}

/** Test-only. Exported constants. */
export const _DRIFT_KEEPER_CONSTANTS = {
  DRIFT_KEEPER_INTERVAL_MS,
  DRIFT_KEEPER_COOLDOWN_MS,
};

/** Test-only. Two-tick divergence latch and its reset. */
export { confirmDivergence as _confirmDivergence, clearPendingDivergence as _clearPendingDivergence };
