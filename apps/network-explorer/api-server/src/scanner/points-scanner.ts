import { sql, pointsDb } from '../db.js';
import {
  SCAN_INTERVAL_MS,
  BATCH_SIZE,
  WALLET_CACHE_REFRESH_MS,
  GENESIS_PASS_MULTIPLIER,
  SCORE_CATEGORIES,
  getEventMapping,
  getBasePoints,
} from '../config/points.js';
import {
  maybeRefreshReferralCache,
  updateIdentityToWalletMap,
  warmUpDailyBonusAccumulator,
  calculateReferralBonuses,
  type PointsInsert,
} from './referral-bonus.js';
import { calculateDailyMissions } from './daily-mission.js';
import {
  maybeRefreshActivationsCache,
  maybeRefreshMatview,
  isMatviewStale,
  getMatviewStatus,
  getActivationsCacheMap,
} from './ecosystem-cache.js';
import { getIdentityToWalletMap } from './referral-bonus.js';
import { runDailyNftChecks, scanTodayWalletTransfers } from './daily-nft-check.js';
import { checkEcosystemMatviewVersion } from '../db/ecosystem-matview-migration.js';
import { scanFaucetClaims, resetFaucetScanner } from './faucet-scanner.js';
import { scanChatParticipation } from './chat-scanner.js';
import { takeDailySnapshot } from './daily-snapshot.js';
import { reconcileFromRpc } from './rpc-reconcile.js';
import { rpcCall } from '../rpc.js';
import { fetchWithOffload } from './fetch-with-offload.js';
import { saveCache, loadCache } from './cache-persist.js';

// Wallet cache: walletAddress (lowercase, with 0x) -> identityId
let registeredWallets = new Map<string, string>();
// Genesis Pass holders: identityId set
let genesisPassHolders = new Set<string>();
let walletCacheLastRefresh = 0;

let isScanning = false;
let scanTimerId: ReturnType<typeof setTimeout> | null = null;
let lastDailyNftCheckDate = '';

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
// Key format: "identityId::category". Cleared on date rollover and chain reset.
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
  // Initial scan after 5s delay (let API server warm up)
  scanTimerId = setTimeout(async () => {
    try {
      await checkEcosystemMatviewVersion();
    } catch (err) {
      console.error('[Points] Matview version check failed:', (err as Error).message);
    }
    try {
      await warmUpDailyBonusAccumulator();
      await warmUpDailyCategoryCap();
    } catch (err) {
      console.error('[Points] Warm-up failed:', (err as Error).message);
    }
    await runScanLoopSafely();
    scheduleNext();
  }, 5000);
}

export function stopPointsScanner(): void {
  if (scanTimerId) {
    clearTimeout(scanTimerId);
    scanTimerId = null;
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
    await runScanLoopSafely();
    scheduleNext();
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

    let lastSeq = await getLastProcessedSequence();

    while (true) {
      if (!isCurrentGen(myGen)) return;
      const batch = await fetchEventBatch(lastSeq, BATCH_SIZE);
      if (batch.length === 0) break;

      const { count: inserted, inserts: batchInserts } = await processBatch(batch);
      totalProcessed += inserted;

      // Referral bonus: isolated try-catch to prevent main loop disruption
      try {
        const bonusCount = await calculateReferralBonuses(batchInserts);
        totalProcessed += bonusCount;
      } catch (err) {
        console.error('[Referral] Bonus calculation error (non-fatal):', err);
      }

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
        registeredWallets, genesisPassHolders, dailyCategorySeen,
      );
      totalProcessed += faucetCount;
    } catch (err) {
      console.error('[Faucet] Scan error (non-fatal):', (err as Error).message);
    }

    // Chat participation detection: query chat server REST APIs (off-chain)
    try {
      const chatCount = await scanChatParticipation(
        registeredWallets, genesisPassHolders, dailyCategorySeen,
      );
      totalProcessed += chatCount;
    } catch (err) {
      console.error('[Chat] Scan error (non-fatal):', (err as Error).message);
    }

    // Today-only wallet transfer detection: runs every loop (skips users
    // already credited). Keeps same-day base_score accurate for late transfers.
    try {
      const walletTransferCount = await scanTodayWalletTransfers(
        getIdentityToWalletMap(),
      );
      totalProcessed += walletTransferCount;
    } catch (err) {
      console.error('[WalletTransfer] Scan error (non-fatal):', (err as Error).message);
    }

    // Daily NFT checks: alliance penalty + genesis passive + yesterday/-2 wallet-transfer catch-up
    // Runs BEFORE matview refresh so its inserts are reflected in the matview
    const todayStr = new Date().toISOString().slice(0, 10);
    if (todayStr !== lastDailyNftCheckDate) {
      try {
        const nftCheckInserts = await runDailyNftChecks(
          getActivationsCacheMap(),
          getIdentityToWalletMap(),
          registeredWallets,
        );
        totalProcessed += nftCheckInserts;
        lastDailyNftCheckDate = todayStr;
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
      // Refresh ecosystem matview when new data was processed
      try {
        await maybeRefreshMatview();
      } catch (err) {
        console.error('[Ecosystem] Matview refresh error (non-fatal):', (err as Error).message);
      }
    } else if (isMatviewStale()) {
      // Even without new data, refresh if stale beyond max threshold
      try {
        await maybeRefreshMatview(true);
      } catch (err) {
        console.error('[Ecosystem] Matview stale refresh error (non-fatal):', (err as Error).message);
      }
    }

    // Daily ecosystem snapshot (after matview is fresh, 5min grace after UTC midnight)
    const utcMinutes = new Date().getUTCMinutes();
    if (todayStr !== lastSnapshotDate && utcMinutes >= 5) {
      // Ensure matview is fresh before snapshot to capture all yesterday's data
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
        try {
          const yesterday = new Date();
          yesterday.setUTCDate(yesterday.getUTCDate() - 1);
          await takeDailySnapshot(
            yesterday.toISOString().slice(0, 10),
            cacheMap,
          );
        } catch (err) {
          console.error('[Snapshot] Error (non-fatal):', (err as Error).message);
        }
        // Mark snapshot as attempted (idempotent via ON CONFLICT). Only set
        // when the cache was actually available so we don't pin
        // lastSnapshotDate to an empty-cache run that skipped everyone.
        lastSnapshotDate = todayStr;
      }
    }

    // RPC reconciliation: verify yesterday's data against blockchain (once per day, after snapshot)
    if (todayStr !== lastReconcileDate && lastSnapshotDate === todayStr) {
      try {
        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);
        const gapsFilled = await reconcileFromRpc(yesterdayStr, registeredWallets, genesisPassHolders);
        lastReconcileDate = todayStr;
        if (gapsFilled > 0) {
          console.log(`[Reconcile] ${yesterdayStr}: ${gapsFilled} gaps filled from RPC`);
        } else {
          console.log(`[Reconcile] ${yesterdayStr}: no gaps found`);
        }
      } catch (err) {
        console.error('[Reconcile] Error (non-fatal):', (err as Error).message);
      }
    }
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
        dailyCategorySeen.add(`${row.identity_id}::${row.category}`);
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
      await pointsDb`
        UPDATE processing_state
        SET last_tx_sequence = 0, chain_genesis_hash = ${currentHash},
            processed_at = NOW(), tx_count = 0
        WHERE scanner_id IN ('main', 'faucet')
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
    WHERE scanner_id = 'main'
  `;
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
      recordUnmappedEvent(
        event.package_hex,
        event.module,
        event.type_name,
        event.tx_digest_hex,
      );
      continue;
    }

    const basePoints = getBasePoints(mapping.category, mapping.activityType);
    if (basePoints === 0) continue; // Skip zero-point activities

    const walletAddress = `0x${event.sender_hex}`;
    const identityId = registeredWallets.get(walletAddress.toLowerCase());

    // Phase 1: only score registered wallets
    if (!identityId) continue;

    // Daily category cap: 1 base_points insert per (identity, category) per day.
    // Also limits referral bonus generation for capped events.
    const capKey = `${identityId}::${mapping.category}`;
    if (dailyCategorySeen.has(capKey)) continue;

    // Score categories: apply genesis multiplier. Base categories: always 1.
    const isScoreCat = SCORE_CATEGORIES.has(mapping.category);
    const volumeTier = 1.0;
    const genesisMult = isScoreCat && genesisPassHolders.has(identityId)
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

async function maybeRefreshWalletCache(): Promise<void> {
  const now = Date.now();
  if (now - walletCacheLastRefresh < WALLET_CACHE_REFRESH_MS) return;

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
      genesisPass: string[];
    }>({
      url: walletMappingsUrl,
      apiKey: walletMappingsKey,
      label: 'Points',
    });

    if (!data) {
      // Lambda failed on cold start: fall back to disk cache
      if (registeredWallets.size === 0) {
        const fallback = loadCache<{ wallets: Record<string, string>; genesisPass: string[] }>('wallet-mappings');
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
      `[Points] Wallet cache refreshed: ${registeredWallets.size} wallets, ${genesisPassHolders.size} genesis pass holders`,
    );
  } catch (err) {
    console.error('[Points] Wallet cache refresh error:', err);
    if (registeredWallets.size === 0) {
      const fallback = loadCache<{ wallets: Record<string, string>; genesisPass: string[] }>('wallet-mappings');
      if (fallback) {
        applyWalletData(fallback);
        console.warn(`[Points] Loaded wallet cache from disk fallback: ${registeredWallets.size} wallets`);
      }
    }
    walletCacheLastRefresh = now;
  }
}

function applyWalletData(data: { wallets: Record<string, string>; genesisPass: string[] }): void {
  if (data.wallets && typeof data.wallets === 'object' && !Array.isArray(data.wallets)) {
    const newMap = new Map<string, string>();
    for (const [addr, id] of Object.entries(data.wallets)) {
      if (typeof addr === 'string' && typeof id === 'string') {
        newMap.set(addr.toLowerCase(), id);
      }
    }
    registeredWallets = newMap;
  }

  if (Array.isArray(data.genesisPass)) {
    genesisPassHolders = new Set(data.genesisPass.filter((v: unknown) => typeof v === 'string'));
  }
}

/** Look up identityId by wallet address (from scanner's cache). */
export function getIdentityByWallet(walletAddress: string): string | undefined {
  return registeredWallets.get(walletAddress.toLowerCase());
}

// --- Exported for health endpoint ---

export async function getScannerHealth(): Promise<{
  enabled: boolean;
  isScanning: boolean;
  lastTxSequence: number;
  processedAt: string | null;
  txCount: number;
  registeredWallets: number;
  genesisPassHolders: number;
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
      genesisPassHolders: 0,
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
    genesisPassHolders: genesisPassHolders.size,
    ecosystem: getMatviewStatus(),
  };
}
