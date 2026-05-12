import { sql, pointsDb } from '../db.js';
import {
  SCAN_INTERVAL_MS,
  BATCH_SIZE,
  WALLET_CACHE_REFRESH_MS,
  GENESIS_PASS_MULTIPLIER,
  SCORE_CATEGORIES,
  IGNORED_EVENT_KEYS,
  getEventMapping,
  getBasePoints,
} from '../config/points.js';
import {
  maybeRefreshReferralCache,
  updateIdentityToWalletMap,
  type PointsInsert,
} from './referral-bonus.js';
import { runDailyReferralBonus } from './daily-referral-bonus.js';
import {
  maybeRefreshActivationsCache,
  maybeRefreshMatview,
  getMatviewStatus,
  getActivationsCacheMap,
  getActivationsCacheSize,
  hasGenesisPass,
} from './ecosystem-cache.js';
import { getIdentityToWalletMap } from './referral-bonus.js';
import { runDailyNftChecks } from './daily-nft-check.js';
import {
  scanWalletTransfersViaIndexer,
  resetWalletTransferScanner,
} from './wallet-transfer-scanner.js';
import { checkEcosystemMatviewVersion } from '../db/ecosystem-matview-migration.js';
import { scanFaucetClaims, resetFaucetScanner } from './faucet-scanner.js';
import { scanChatParticipation } from './chat-scanner.js';
import { takeDailySnapshot } from './daily-snapshot.js';
import { reconcileFromRpc } from './rpc-reconcile.js';
import { runInvariantAuditDaily } from './invariant-audit.js';
import { rpcCall } from '../rpc.js';
import { fetchWithOffload } from './fetch-with-offload.js';
import { saveCache, loadCache } from './cache-persist.js';

// Wallet cache: walletAddress (lowercase, with 0x) -> identityId
let registeredWallets = new Map<string, string>();
let walletCacheLastRefresh = 0;

let isScanning = false;
let isReconciling = false;
let scanTimerId: ReturnType<typeof setTimeout> | null = null;
let matviewTimerId: ReturnType<typeof setInterval> | null = null;
let lastDailyNftCheckDate = '';

// Matview refresh runs on its own timer, independent of scanLoop, so a slow
// REFRESH MATERIALIZED VIEW CONCURRENTLY (can exceed 3min on large tables)
// never triggers the scanLoop timeout.
const MATVIEW_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// Hard ceiling for a single scanLoop iteration. If it doesn't return within
// this window we assume something hung (RPC, DB, cache refresh) and start
// a fresh iteration. Any in-flight work from the abandoned loop is fenced
// off by currentGeneration so it can't rewind state.
const SCAN_LOOP_TIMEOUT_MS = 3 * 60 * 1000;

// Generation counter: incremented each time we start a fresh scanLoop after
// a timeout. The active loop captures its own generation on entry; after
// every await boundary it checks against currentGeneration and bails if the
// timeout wrapper already moved on. This prevents an old, zombie loop from
// overwriting last_tx_sequence backward or double-counting referral bonuses.
let currentGeneration = 0;

function isCurrentGen(myGen: number): boolean {
  return myGen === currentGeneration;
}

async function runScanLoopSafely(): Promise<void> {
  const myGen = ++currentGeneration;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      scanLoop(myGen),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`scanLoop exceeded ${SCAN_LOOP_TIMEOUT_MS}ms`)),
          SCAN_LOOP_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (err) {
    console.error('[Points] scanLoop failed:', (err as Error).message);
    // Release the re-entry guard so the next iteration can run. The abandoned
    // scanLoop, if still alive, is fenced by isCurrentGen() at every await
    // boundary and will self-exit on its next check.
    isScanning = false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
let lastSnapshotDate = '';
let lastReconcileDate = '';

// Daily category cap: only one base_points insert per (identity, category) per day.
// Key format: "identityId::category::YYYY-MM-DD" (3-part). The date suffix lets
// stale entries expire naturally on rollover and keeps faucet/chat-scanner
// (which used to use 2-part keys) in lockstep with processBatch's warm-up.
// Cleared on date rollover (scanLoop top + processBatch) and chain reset.
let dailyCategorySeen = new Set<string>();

// Unmapped event detection (Phase 2 of points-audit plan).
// Single-instance scanner (PM2 fork mode) — no cross-worker sync needed.
const UNMAPPED_MAX = 1000;                          // cardinality safety cap
const UNMAPPED_TTL_MS = 24 * 60 * 60 * 1000;        // 24h reset (re-confirm daily)
const UNMAPPED_RESET_GRACE_MS = 60_000;             // 60s after reset, suppress to avoid restart spam
const unmappedSeen = new Map<string, number>();     // key -> lastSeenMs (insertion order = LRU FIFO via delete+set)
let unmappedResetAt = Date.now();
let unmappedSuppressedSinceReset = 0;
let dailyCategoryDate = '';

// --- Public API ---

export function startPointsScanner(): void {
  if (!pointsDb) {
    console.warn('[Points] POINTS_DATABASE_URL not set, scanner disabled');
    return;
  }
  console.log('[Points] Scanner starting...');
  // Matview refresh runs independently so it never blocks or times out the scanLoop.
  // Fire immediately on startup to cover the first 5-minute window (setInterval fires after delay).
  maybeRefreshMatview().catch((err) => {
    console.error('[Ecosystem] Initial matview refresh error:', (err as Error).message);
  });
  matviewTimerId = setInterval(async () => {
    try {
      await maybeRefreshMatview();
    } catch (err) {
      console.error('[Ecosystem] Scheduled matview refresh error:', (err as Error).message);
    }
  }, MATVIEW_REFRESH_INTERVAL_MS);
  // Initial scan after 5s delay (let API server warm up)
  scanTimerId = setTimeout(async () => {
    try {
      await checkEcosystemMatviewVersion();
    } catch (err) {
      console.error('[Points] Matview version check failed:', (err as Error).message);
    }
    try {
      // (Referral bonus warm-up removed: bonuses are batched once per UTC
      //  day in daily-referral-bonus.ts; no in-process accumulator state.)
      await warmUpDailyCategoryCap();
    } catch (err) {
      console.error('[Points] Warm-up failed:', (err as Error).message);
    }
    try {
      await runScanLoopSafely();
    } finally {
      scheduleNext();
    }
  }, 5000);
}

export function stopPointsScanner(): void {
  if (scanTimerId) {
    clearTimeout(scanTimerId);
    scanTimerId = null;
  }
  if (matviewTimerId) {
    clearInterval(matviewTimerId);
    matviewTimerId = null;
  }
}

// --- Internals ---

// Records an unmapped event signature for operator visibility.
// First-seen WARN suppressed during 60s post-reset grace window.
function recordUnmappedEvent(
  packageHex: string,
  module: string,
  typeName: string,
  sampleTxDigest: string,
): void {
  const now = Date.now();

  // 24h TTL reset (re-confirm daily; cap-eviction handled separately below)
  if (now - unmappedResetAt > UNMAPPED_TTL_MS) {
    unmappedSeen.clear();
    unmappedResetAt = now;
    unmappedSuppressedSinceReset = 0;
  }

  const key = `${packageHex}::${module}::${typeName}`;

  if (unmappedSeen.has(key)) {
    // LRU: V8 Map.set on existing key keeps order — delete + set moves to most-recent
    unmappedSeen.delete(key);
    unmappedSeen.set(key, now);
    return;
  }

  // FIFO eviction when at capacity (silent-drop guarded — eviction itself logs)
  if (unmappedSeen.size >= UNMAPPED_MAX) {
    const oldest = unmappedSeen.keys().next().value;
    if (oldest !== undefined) unmappedSeen.delete(oldest);
    console.warn(
      `[Points] UNMAPPED CACHE EVICTION (cap=${UNMAPPED_MAX}): evicted=${oldest}, new mappings rediscovered next cycle`,
    );
  }

  unmappedSeen.set(key, now);

  if (now - unmappedResetAt > UNMAPPED_RESET_GRACE_MS) {
    console.warn(
      `[Points] UNMAPPED EVENT FIRST SEEN: ${key} sample_tx=0x${sampleTxDigest}`,
    );
  } else {
    unmappedSuppressedSinceReset++;
  }
}

// Emits a single trailing summary if the reset grace window has expired
// and signatures were suppressed during it. Called once per scan loop end.
function flushUnmappedSummary(): void {
  if (
    unmappedSuppressedSinceReset > 0 &&
    Date.now() - unmappedResetAt > UNMAPPED_RESET_GRACE_MS
  ) {
    console.warn(
      `[Points] UNMAPPED reset-grace summary: ${unmappedSuppressedSinceReset} signatures suppressed in first 60s after reset`,
    );
    unmappedSuppressedSinceReset = 0;
  }
}

function scheduleNext(): void {
  scanTimerId = setTimeout(async () => {
    try {
      await runScanLoopSafely();
    } finally {
      scheduleNext();
    }
  }, SCAN_INTERVAL_MS);
}

async function scanLoop(myGen: number): Promise<void> {
  if (isScanning || !pointsDb) return;
  isScanning = true;
  const startTime = Date.now();
  let totalProcessed = 0;

  try {
    await detectChainReset();
    if (!isCurrentGen(myGen)) return;
    await maybeRefreshWalletCache();
    if (!isCurrentGen(myGen)) return;
    // Referral: refresh cache and build reverse wallet map
    await maybeRefreshReferralCache();
    updateIdentityToWalletMap(registeredWallets);
    // Ecosystem: refresh NFT activations cache (for multiplier calculation)
    await maybeRefreshActivationsCache();
    if (!isCurrentGen(myGen)) return;

    // Date-rollover reset, scanLoop-scoped. processBatch already does this
    // but only when the main event batch has rows. Faucet/chat scanners run
    // regardless of event activity, so without this top-level check, a quiet
    // main loop right after UTC midnight would leave stale yesterday cap
    // keys blocking today's first chat/faucet credit.
    {
      const todayCap = new Date().toISOString().slice(0, 10);
      if (todayCap !== dailyCategoryDate) {
        dailyCategorySeen = new Set();
        dailyCategoryDate = todayCap;
      }
    }

    let lastSeq = await getLastProcessedSequence();

    while (true) {
      if (!isCurrentGen(myGen)) return;
      const batch = await fetchEventBatch(lastSeq, BATCH_SIZE);
      if (batch.length === 0) break;

      const { count: inserted } = await processBatch(batch);
      totalProcessed += inserted;

      // (Per-batch referral bonus calc removed; runs once per UTC day in
      //  the snapshot block below to capture admin-curated grants too.)

      lastSeq = batch[batch.length - 1].tx_sequence_number;
      // Final gate before persisting cursor: prevents a zombie loop from
      // rewinding last_tx_sequence if the fresh loop has already advanced it.
      if (!isCurrentGen(myGen)) return;
      await updateProcessingState(lastSeq, inserted);

      // Yield to event loop between batches
      await new Promise((resolve) => setImmediate(resolve));
    }

    // Faucet detection: scan tx_calls_fun for faucet claims (no Move events)
    try {
      const faucetCount = await scanFaucetClaims(
        registeredWallets, dailyCategorySeen,
      );
      totalProcessed += faucetCount;
    } catch (err) {
      console.error('[Faucet] Scan error (non-fatal):', (err as Error).message);
    }

    // Chat participation detection: query chat server REST APIs (off-chain)
    try {
      const chatCount = await scanChatParticipation(
        registeredWallets, dailyCategorySeen,
      );
      totalProcessed += chatCount;
    } catch (err) {
      console.error('[Chat] Scan error (non-fatal):', (err as Error).message);
    }

    // Wallet-transfer detection via indexer SQL (O(delta), not O(registered)).
    // Replaces the legacy RPC-based cursor probe that scaled linearly with
    // registered-wallet count. Honors "1 identity ↔ N linked wallets" by
    // querying tx_affected_addresses where sender ∈ registeredWallets.
    try {
      const walletTransferCount =
        await scanWalletTransfersViaIndexer(registeredWallets);
      totalProcessed += walletTransferCount;
    } catch (err) {
      console.error('[WalletTransfer] Scan error (non-fatal):', (err as Error).message);
    }

    // Daily NFT checks: alliance penalty + genesis passive + yesterday/-2 wallet-transfer catch-up
    // Runs BEFORE matview refresh so its inserts are reflected in the matview
    const todayStr = new Date().toISOString().slice(0, 10);
    if (todayStr !== lastDailyNftCheckDate) {
      try {
        const nftCheckResult = await runDailyNftChecks(
          getActivationsCacheMap(),
          getIdentityToWalletMap(),
          registeredWallets,
        );
        totalProcessed += nftCheckResult.totalInserts;
        // Keep the daily gate open if today's staking-daily had RPC partial
        // failures; the next scan cycle will retry the missed identities.
        // ON CONFLICT DO NOTHING makes already-awarded users idempotent.
        if (!nftCheckResult.stakingRetryNeeded) {
          lastDailyNftCheckDate = todayStr;
        }
      } catch (err) {
        console.error('[DailyNftCheck] Error (non-fatal):', (err as Error).message);
      }
    }

    flushUnmappedSummary();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (totalProcessed > 0) {
      console.log(
        `[Points] Scan complete: ${totalProcessed} points recorded in ${elapsed}s`,
      );
    }

    if (totalProcessed > 0) {
      // Trigger matview refresh fire-and-forget so scanLoop is not blocked.
      // The independent matview timer (startMatviewWorker) also covers staleness.
      maybeRefreshMatview().catch((err) => {
        console.error('[Ecosystem] Matview refresh error (non-fatal):', (err as Error).message);
      });
    }

    // Daily ecosystem snapshot (after matview is fresh, 5min grace after UTC midnight).
    const utcMinutes = new Date().getUTCMinutes();
    if (todayStr !== lastSnapshotDate && utcMinutes >= 5) {
      // Ensure matview is fresh before snapshot: stale data here produces wrong historical records.
      // This is the one place we await the refresh — it runs once per day so the latency is acceptable,
      // and the independent matview timer's MATVIEW_REFRESH_MIN_INTERVAL_MS guard makes it a no-op
      // if a refresh already completed recently.
      try {
        await maybeRefreshMatview();
      } catch (err) {
        console.error('[Ecosystem] Pre-snapshot matview refresh error (non-fatal):', (err as Error).message);
      }
      const cacheMap = getActivationsCacheMap();
      if (cacheMap.size === 0) {
        // Don't set lastSnapshotDate -- the activations cache populates on
        // the first refresh after process start, and a restart that lands
        // in the 00:05 cache-warmup window would otherwise lose the snapshot
        // for the entire day. Letting the next scanLoop retry recovers.
        console.warn('[Snapshot] Skipped: activation cache is empty (would record multiplier=0 for all users); will retry next loop');
      } else {
        let snapshotOk = false;
        try {
          const yesterday = new Date();
          yesterday.setUTCDate(yesterday.getUTCDate() - 1);
          snapshotOk = await takeDailySnapshot(
            yesterday.toISOString().slice(0, 10),
            cacheMap,
          );
        } catch (err) {
          console.error('[Snapshot] Error (non-fatal):', (err as Error).message);
        }
        // Only mark the day as done when the snapshot actually reached the
        // INSERT phase. Early fail-safe aborts (missing health rows, matview
        // sanity gate) return false so the next scanLoop retries within the
        // same UTC day instead of pinning the gate and losing the snapshot
        // entirely (root cause of the 2026-05-08 missing-snapshot incident).
        if (snapshotOk) {
          lastSnapshotDate = todayStr;

          // Daily referral bonus: 10% of yesterday's total points (incl.
          // admin-curated) to both referrer and referred. Idempotent via
          // ON CONFLICT DO NOTHING. Runs only after the snapshot has
          // finalized yesterday's data and only once per UTC day.
          try {
            const yesterday = new Date();
            yesterday.setUTCDate(yesterday.getUTCDate() - 1);
            await runDailyReferralBonus(yesterday.toISOString().slice(0, 10));
          } catch (err) {
            console.error('[Referral-Daily] Error (non-fatal):', (err as Error).message);
          }
        }
      }
    }

    // RPC reconciliation: verify yesterday's data against blockchain (once per day, after snapshot).
    // Runs outside the scanLoop timeout window (reconcile can take up to 10 min; scanLoop is capped
    // at 3 min). Fire-and-forget: set lastReconcileDate immediately to prevent duplicate launches.
    if (todayStr !== lastReconcileDate && lastSnapshotDate === todayStr && !isReconciling) {
      lastReconcileDate = todayStr;
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      // Capture snapshot of wallet map at launch time (mutated by reference, clone to freeze).
      // GP holder lookup goes through hasGenesisPass() which reads activationsCache directly.
      const walletSnapshot = new Map(registeredWallets);
      isReconciling = true;
      reconcileFromRpc(yesterdayStr, walletSnapshot)
        .then(async (gapsFilled) => {
          if (gapsFilled > 0) {
            console.log(`[Reconcile] ${yesterdayStr}: ${gapsFilled} gaps filled from RPC`);
          } else {
            console.log(`[Reconcile] ${yesterdayStr}: no gaps found`);
          }
        })
        .catch((err: unknown) => {
          console.error('[Reconcile] Error (non-fatal):', (err as Error).message);
          // Reset so the next scanLoop can retry (prevents permanent skip on transient errors)
          lastReconcileDate = '';
        })
        .finally(() => {
          isReconciling = false;
        });
    }

    // Daily ledger invariant audit (chain consistency / sum invariant /
    // monotonic-decrease). Independent of snapshot/reconcile state so a
    // broken snapshot loop doesn't also disable the audit. Self-gated to
    // run at most once per UTC day inside runInvariantAuditDaily().
    runInvariantAuditDaily().catch((err: unknown) => {
      console.error('[InvariantAudit] Run error (non-fatal):', (err as Error).message);
    });
  } catch (err) {
    console.error('[Points] Scan error:', err);
  } finally {
    isScanning = false;
  }
}

// --- Daily category cap warm-up ---

async function warmUpDailyCategoryCap(): Promise<void> {
  if (!pointsDb) return;
  const today = new Date().toISOString().slice(0, 10);
  dailyCategoryDate = today;

  try {
    const rows = await pointsDb`
      SELECT DISTINCT identity_id, category
      FROM activity_points
      WHERE tx_timestamp >= ${today}::date
        AND tx_timestamp < (${today}::date + interval '1 day')
        AND base_points > 0
        AND NOT flagged
    `;

    dailyCategorySeen = new Set();
    for (const row of rows) {
      if (row.identity_id) {
        // Cap key matches processBatch(): identity::category::txDate
        dailyCategorySeen.add(`${row.identity_id}::${row.category}::${today}`);
      }
    }
    console.log(`[Points] Daily cap warm-up: ${dailyCategorySeen.size} entries`);
  } catch (err) {
    console.error('[Points] Daily cap warm-up error:', err);
  }
}

// --- Chain reset detection ---

async function detectChainReset(): Promise<void> {
  if (!pointsDb) return;

  try {
    // Fetch genesis checkpoint (seq 0) via RPC for stable chain identity.
    // The indexer's earliest checkpoint changes on DB rebuild, but the RPC
    // always returns the true genesis, making this resistant to false positives.
    const genesisCheckpoint = await rpcCall<{ digest: string }>(
      'sui_getCheckpoint',
      ['0'],
    );
    if (!genesisCheckpoint?.digest) return;

    const currentHash = genesisCheckpoint.digest;
    const [state] = await pointsDb`
      SELECT chain_genesis_hash, last_tx_sequence
      FROM processing_state WHERE scanner_id = 'main'
    `;

    if (state?.chain_genesis_hash && state.chain_genesis_hash !== currentHash) {
      // Actual chain reset: genesis digest changed
      console.warn(
        '[Points] Chain reset detected! Old:',
        state.chain_genesis_hash,
        'New:',
        currentHash,
      );
      console.warn('[Points] Purging old activity_points and resetting scanner');
      await pointsDb`TRUNCATE activity_points`;
      dailyCategorySeen = new Set();
      dailyCategoryDate = '';
      resetFaucetScanner();
      resetWalletTransferScanner();
      await pointsDb`
        UPDATE processing_state
        SET last_tx_sequence = 0, chain_genesis_hash = ${currentHash},
            processed_at = NOW(), tx_count = 0
        WHERE scanner_id IN ('main', 'faucet', 'wallet-transfer')
      `;
    } else if (!state?.chain_genesis_hash) {
      await pointsDb`
        UPDATE processing_state
        SET chain_genesis_hash = ${currentHash}
        WHERE scanner_id = 'main'
      `;
    } else {
      // Same chain, but check if the indexer was rebuilt (last_tx_sequence gap)
      await detectIndexerRebuild(Number(state.last_tx_sequence));
    }
  } catch (err) {
    console.error('[Points] Chain reset detection error:', err);
  }
}

// When the indexer DB is rebuilt, old tx sequences disappear.
// Fast-forward the scanner to the indexer's earliest available sequence
// without purging valid points data.
async function detectIndexerRebuild(lastSeq: number): Promise<void> {
  if (!pointsDb || lastSeq === 0) return;

  const [earliest] = await sql`
    SELECT MIN(tx_sequence_number)::bigint as min_seq
    FROM event_struct_name
  `;
  const minSeq = Number(earliest?.min_seq ?? 0);
  if (minSeq === 0 || lastSeq >= minSeq) return;

  // Scanner's position is behind the indexer's earliest data
  console.warn(
    `[Points] Indexer rebuild detected. Scanner at seq ${lastSeq}, indexer starts at ${minSeq}. Fast-forwarding.`,
  );
  await pointsDb`
    UPDATE processing_state
    SET last_tx_sequence = ${minSeq - 1}, processed_at = NOW()
    WHERE scanner_id IN ('main', 'faucet', 'wallet-transfer')
  `;
  resetFaucetScanner();
  resetWalletTransferScanner();
}

// --- Processing state ---

async function getLastProcessedSequence(): Promise<number> {
  if (!pointsDb) return 0;
  const [row] = await pointsDb`
    SELECT last_tx_sequence FROM processing_state WHERE scanner_id = 'main'
  `;
  return Number(row?.last_tx_sequence ?? 0);
}

async function updateProcessingState(
  lastSeq: number,
  newCount: number,
): Promise<void> {
  if (!pointsDb) return;
  await pointsDb`
    UPDATE processing_state
    SET last_tx_sequence = ${lastSeq},
        processed_at = NOW(),
        tx_count = tx_count + ${newCount}
    WHERE scanner_id = 'main'
  `;
}

// --- Event fetching from sui_indexer ---

interface RawEvent {
  tx_sequence_number: number;
  event_sequence_number: number;
  package_hex: string;
  module: string;
  type_name: string;
  sender_hex: string;
  timestamp_ms: string;
  tx_digest_hex: string;
}

async function fetchEventBatch(
  afterSeq: number,
  limit: number,
): Promise<RawEvent[]> {
  // Join event_struct_name (accurate matching, no generics) with events (timestamp, digest)
  // event_struct_name.sender is BYTEA, events.transaction_digest is BYTEA
  const rows = await sql`
    SELECT
      esn.tx_sequence_number::bigint as tx_sequence_number,
      esn.event_sequence_number::int as event_sequence_number,
      encode(esn.package, 'hex') as package_hex,
      esn.module,
      esn.type_name,
      encode(esn.sender, 'hex') as sender_hex,
      e.timestamp_ms::text as timestamp_ms,
      encode(e.transaction_digest, 'hex') as tx_digest_hex
    FROM event_struct_name esn
    JOIN events e
      ON esn.tx_sequence_number = e.tx_sequence_number
     AND esn.event_sequence_number = e.event_sequence_number
    WHERE esn.tx_sequence_number > ${afterSeq}
    ORDER BY esn.tx_sequence_number, esn.event_sequence_number
    LIMIT ${limit}
  `;

  return rows as unknown as RawEvent[];
}

// --- Batch processing ---

async function processBatch(
  batch: RawEvent[],
): Promise<{ count: number; inserts: PointsInsert[] }> {
  if (!pointsDb) return { count: 0, inserts: [] };

  // Daily category cap: reset on date rollover
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyCategoryDate) {
    dailyCategorySeen = new Set();
    dailyCategoryDate = today;
  }

  const inserts: PointsInsert[] = [];

  for (const event of batch) {
    const mapping = getEventMapping(
      event.package_hex,
      event.module,
      event.type_name,
    );

    if (!mapping) {
      const key = `${event.package_hex}::${event.module}::${event.type_name}`;
      if (!IGNORED_EVENT_KEYS.has(key)) {
        recordUnmappedEvent(
          event.package_hex,
          event.module,
          event.type_name,
          event.tx_digest_hex,
        );
      }
      continue;
    }

    const basePoints = getBasePoints(mapping.category, mapping.activityType);
    if (basePoints === 0) continue; // Skip zero-point activities

    const walletAddress = `0x${event.sender_hex}`;
    const identityId = registeredWallets.get(walletAddress.toLowerCase());

    // Phase 1: only score registered wallets
    if (!identityId) continue;

    // Daily category cap: 1 base_points insert per (identity, category, day).
    // The day component MUST be the transaction's UTC date, not the process's
    // current date — without this, a re-scan that walks historical events
    // (e.g. after a chain reset clearing activity_points) would skip every
    // (identity, category) pair after its first occurrence regardless of date,
    // collapsing all historical activity into a single per-pair row. The
    // integrity guard on activity_points currently makes this scenario
    // unreachable, but the keying is documented as the safety net here too.
    const txDate = new Date(Number(event.timestamp_ms)).toISOString().slice(0, 10);
    const capKey = `${identityId}::${mapping.category}::${txDate}`;
    if (dailyCategorySeen.has(capKey)) continue;

    // Score categories: apply genesis multiplier. Base categories: always 1.
    const isScoreCat = SCORE_CATEGORIES.has(mapping.category);
    const volumeTier = 1.0;
    // Forward-only safety: if the activations cache is empty (cold start or
    // misconfiguration), skip score-category writes rather than baking in an
    // incorrect 1.0 multiplier for what may be a real GP holder. rpc-reconcile
    // will fill the gap on the next daily run when the cache is loaded.
    if (isScoreCat && getActivationsCacheSize() === 0) {
      console.warn(
        `[Points] Skipping score-category write for ${mapping.category}: activations cache empty`,
      );
      continue;
    }
    const genesisMult = isScoreCat && hasGenesisPass(identityId)
      ? GENESIS_PASS_MULTIPLIER
      : 1.0;
    const finalPoints = isScoreCat
      ? (basePoints * volumeTier * genesisMult).toFixed(2)
      : '1.00';

    inserts.push({
      wallet_address: walletAddress,
      identity_id: identityId,
      tx_digest: `0x${event.tx_digest_hex}`,
      tx_sequence_number: event.tx_sequence_number,
      category: mapping.category,
      activity_type: mapping.activityType,
      base_points: basePoints,
      volume_tier: volumeTier,
      genesis_multiplier: genesisMult,
      final_points: finalPoints,
      tx_timestamp: new Date(Number(event.timestamp_ms)),
      event_seq: event.event_sequence_number,
    });

    dailyCategorySeen.add(capKey);
  }

  if (inserts.length === 0) return { count: 0, inserts: [] };

  // Bulk insert with ON CONFLICT DO NOTHING (idempotent)
  const result = await pointsDb`
    INSERT INTO activity_points ${pointsDb(inserts, 'wallet_address', 'identity_id', 'tx_digest', 'tx_sequence_number', 'category', 'activity_type', 'base_points', 'volume_tier', 'genesis_multiplier', 'final_points', 'tx_timestamp', 'event_seq')}
    ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
  `;

  return { count: result.count, inserts };
}

// --- Wallet cache ---

export async function maybeRefreshWalletCache(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - walletCacheLastRefresh < WALLET_CACHE_REFRESH_MS) return;

  const walletMappingsUrl = process.env.WALLET_MAPPINGS_URL;
  const walletMappingsKey = process.env.WALLET_MAPPINGS_API_KEY;

  if (!walletMappingsUrl) {
    if (registeredWallets.size === 0) {
      console.warn(
        '[Points] WALLET_MAPPINGS_URL not set, no wallets registered',
      );
    }
    walletCacheLastRefresh = now;
    return;
  }

  try {
    const data = await fetchWithOffload<{
      wallets: Record<string, string>;
    }>({
      url: walletMappingsUrl,
      apiKey: walletMappingsKey,
      label: 'Points',
    });

    if (!data) {
      // Lambda failed on cold start: fall back to disk cache
      if (registeredWallets.size === 0) {
        const fallback = loadCache<{ wallets: Record<string, string> }>('wallet-mappings');
        if (fallback) {
          applyWalletData(fallback);
          console.warn(`[Points] Loaded wallet cache from disk fallback: ${registeredWallets.size} wallets`);
        }
      }
      walletCacheLastRefresh = now;
      return;
    }

    applyWalletData(data);
    saveCache('wallet-mappings', data);

    walletCacheLastRefresh = now;
    console.log(
      `[Points] Wallet cache refreshed: ${registeredWallets.size} wallets`,
    );
  } catch (err) {
    console.error('[Points] Wallet cache refresh error:', err);
    if (registeredWallets.size === 0) {
      const fallback = loadCache<{ wallets: Record<string, string> }>('wallet-mappings');
      if (fallback) {
        applyWalletData(fallback);
        console.warn(`[Points] Loaded wallet cache from disk fallback: ${registeredWallets.size} wallets`);
      }
    }
    walletCacheLastRefresh = now;
  }
}

function applyWalletData(data: { wallets: Record<string, string> }): void {
  if (data.wallets && typeof data.wallets === 'object' && !Array.isArray(data.wallets)) {
    const newMap = new Map<string, string>();
    for (const [addr, id] of Object.entries(data.wallets)) {
      if (typeof addr === 'string' && typeof id === 'string') {
        newMap.set(addr.toLowerCase(), id);
      }
    }
    registeredWallets = newMap;
  }
}

/** Look up identityId by wallet address (from scanner's cache). */
export function getIdentityByWallet(walletAddress: string): string | undefined {
  return registeredWallets.get(walletAddress.toLowerCase());
}

/** All registered wallets for a given identity (from scanner's cache). */
export function getWalletsForIdentity(identityId: string): string[] {
  const out: string[] = [];
  for (const [wallet, id] of registeredWallets) {
    if (id === identityId) out.push(wallet);
  }
  return out;
}

// --- Exported for health endpoint ---

export async function getScannerHealth(): Promise<{
  enabled: boolean;
  isScanning: boolean;
  lastTxSequence: number;
  processedAt: string | null;
  txCount: number;
  registeredWallets: number;
  ecosystem: { lastRefresh: string | null; stale: boolean; activationsCacheSize: number };
}> {
  if (!pointsDb) {
    return {
      enabled: false,
      isScanning: false,
      lastTxSequence: 0,
      processedAt: null,
      txCount: 0,
      registeredWallets: 0,
      ecosystem: { lastRefresh: null, stale: true, activationsCacheSize: 0 },
    };
  }

  const [state] = await pointsDb`
    SELECT last_tx_sequence, processed_at, tx_count
    FROM processing_state
    WHERE scanner_id = 'main'
  `;

  return {
    enabled: true,
    isScanning,
    lastTxSequence: Number(state?.last_tx_sequence ?? 0),
    processedAt: state?.processed_at?.toISOString() ?? null,
    txCount: Number(state?.tx_count ?? 0),
    registeredWallets: registeredWallets.size,
    ecosystem: getMatviewStatus(),
  };
}
