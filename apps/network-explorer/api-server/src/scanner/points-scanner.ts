import { sql, pointsDb } from '../db.js';
import {
  SCAN_INTERVAL_MS,
  BATCH_SIZE,
  WALLET_CACHE_REFRESH_MS,
  GENESIS_PASS_MULTIPLIER,
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
import { runDailyNftChecks } from './daily-nft-check.js';
import { rpcCall } from '../rpc.js';

// Wallet cache: walletAddress (lowercase, with 0x) -> identityId
let registeredWallets = new Map<string, string>();
// Genesis Pass holders: identityId set
let genesisPassHolders = new Set<string>();
let walletCacheLastRefresh = 0;

let isScanning = false;
let scanTimerId: ReturnType<typeof setTimeout> | null = null;
let lastDailyNftCheckDate = '';

// --- Public API ---

export function startPointsScanner(): void {
  if (!pointsDb) {
    console.warn('[Points] POINTS_DATABASE_URL not set, scanner disabled');
    return;
  }
  console.log('[Points] Scanner starting...');
  // Initial scan after 5s delay (let API server warm up)
  scanTimerId = setTimeout(async () => {
    await warmUpDailyBonusAccumulator();
    await scanLoop();
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

function scheduleNext(): void {
  scanTimerId = setTimeout(async () => {
    await scanLoop();
    scheduleNext();
  }, SCAN_INTERVAL_MS);
}

async function scanLoop(): Promise<void> {
  if (isScanning || !pointsDb) return;
  isScanning = true;
  const startTime = Date.now();
  let totalProcessed = 0;

  try {
    await detectChainReset();
    await maybeRefreshWalletCache();
    // Referral: refresh cache and build reverse wallet map
    await maybeRefreshReferralCache();
    updateIdentityToWalletMap(registeredWallets);
    // Ecosystem: refresh NFT activations cache (for multiplier calculation)
    await maybeRefreshActivationsCache();

    let lastSeq = await getLastProcessedSequence();

    while (true) {
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
      await updateProcessingState(lastSeq, inserted);

      // Yield to event loop between batches
      await new Promise((resolve) => setImmediate(resolve));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (totalProcessed > 0) {
      // Daily mission bonus: runs once per scanLoop, not per batch
      try {
        const missionCount = await calculateDailyMissions(registeredWallets);
        if (missionCount > 0) {
          totalProcessed += missionCount;
          console.log(`[DailyMission] Awarded ${missionCount} mission points`);
        }
      } catch (err) {
        console.error('[DailyMission] Error (non-fatal):', (err as Error).message);
      }

      console.log(
        `[Points] Scan complete: ${totalProcessed} points recorded in ${elapsed}s`,
      );
    }

    // Daily NFT checks: alliance penalty + genesis passive (once per day)
    const todayStr = new Date().toISOString().slice(0, 10);
    if (todayStr !== lastDailyNftCheckDate) {
      try {
        await runDailyNftChecks(
          getActivationsCacheMap(),
          getIdentityToWalletMap(),
        );
        lastDailyNftCheckDate = todayStr;
      } catch (err) {
        console.error('[DailyNftCheck] Error (non-fatal):', (err as Error).message);
      }
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
  } catch (err) {
    console.error('[Points] Scan error:', err);
  } finally {
    isScanning = false;
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
      await pointsDb`
        UPDATE processing_state
        SET last_tx_sequence = 0, chain_genesis_hash = ${currentHash},
            processed_at = NOW(), tx_count = 0
        WHERE scanner_id = 'main'
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

  const inserts: PointsInsert[] = [];

  for (const event of batch) {
    const mapping = getEventMapping(
      event.package_hex,
      event.module,
      event.type_name,
    );

    if (!mapping) {
      // Uncomment to discover unmapped events during initial scan:
      // console.log(`[Points] Unmatched event: ${event.package_hex}::${event.module}::${event.type_name}`);
      continue;
    }

    const basePoints = getBasePoints(mapping.category, mapping.activityType);
    if (basePoints === 0) continue; // Skip zero-point activities

    const walletAddress = `0x${event.sender_hex}`;
    const identityId = registeredWallets.get(walletAddress.toLowerCase());

    // Phase 1: only score registered wallets
    if (!identityId) continue;

    const volumeTier = 1.0; // Phase 1: no volume parsing yet
    const genesisMult = genesisPassHolders.has(identityId)
      ? GENESIS_PASS_MULTIPLIER
      : 1.0;

    // Compute final_points as string to preserve NUMERIC precision
    const finalPoints = (basePoints * volumeTier * genesisMult).toFixed(2);

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
    // Fallback: if no URL configured, keep empty cache
    // All events will be skipped until wallet mappings are available
    if (registeredWallets.size === 0) {
      console.warn(
        '[Points] WALLET_MAPPINGS_URL not set, no wallets registered',
      );
    }
    walletCacheLastRefresh = now;
    return;
  }

  try {
    const headers: Record<string, string> = {};
    if (walletMappingsKey) {
      headers['x-api-key'] = walletMappingsKey;
    }

    const res = await fetch(walletMappingsUrl, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(
        `[Points] Wallet cache refresh failed: ${res.status} ${res.statusText}`,
      );
      walletCacheLastRefresh = now;
      return;
    }

    const data = await res.json();

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

    walletCacheLastRefresh = now;
    console.log(
      `[Points] Wallet cache refreshed: ${registeredWallets.size} wallets, ${genesisPassHolders.size} genesis pass holders`,
    );
  } catch (err) {
    console.error('[Points] Wallet cache refresh error:', err);
    walletCacheLastRefresh = now;
  }
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
