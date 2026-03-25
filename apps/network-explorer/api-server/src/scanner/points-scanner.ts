import { sql, pointsDb } from '../db.js';
import {
  SCAN_INTERVAL_MS,
  BATCH_SIZE,
  WALLET_CACHE_REFRESH_MS,
  GENESIS_PASS_MULTIPLIER,
  getEventMapping,
  getBasePoints,
} from '../config/points.js';

// Wallet cache: walletAddress (lowercase, with 0x) -> identityId
let registeredWallets = new Map<string, string>();
// Genesis Pass holders: identityId set
let genesisPassHolders = new Set<string>();
let walletCacheLastRefresh = 0;

let isScanning = false;
let scanTimerId: ReturnType<typeof setTimeout> | null = null;

// --- Public API ---

export function startPointsScanner(): void {
  if (!pointsDb) {
    console.warn('[Points] POINTS_DATABASE_URL not set, scanner disabled');
    return;
  }
  console.log('[Points] Scanner starting...');
  // Initial scan after 5s delay (let API server warm up)
  scanTimerId = setTimeout(async () => {
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

    let lastSeq = await getLastProcessedSequence();

    while (true) {
      const batch = await fetchEventBatch(lastSeq, BATCH_SIZE);
      if (batch.length === 0) break;

      const inserted = await processBatch(batch);
      totalProcessed += inserted;

      lastSeq = batch[batch.length - 1].tx_sequence_number;
      await updateProcessingState(lastSeq, inserted);

      // Yield to event loop between batches
      await new Promise((resolve) => setImmediate(resolve));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (totalProcessed > 0) {
      console.log(
        `[Points] Scan complete: ${totalProcessed} points recorded in ${elapsed}s`,
      );
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
    // Use earliest checkpoint as chain identity (genesis cp may not exist)
    const [earliest] = await sql`
      SELECT encode(checkpoint_digest, 'hex') as digest_hex
      FROM checkpoints
      ORDER BY sequence_number ASC
      LIMIT 1
    `;
    if (!earliest) return;

    const currentHash = earliest.digest_hex as string;
    const [state] = await pointsDb`
      SELECT chain_genesis_hash FROM processing_state WHERE scanner_id = 'main'
    `;

    if (state?.chain_genesis_hash && state.chain_genesis_hash !== currentHash) {
      console.warn(
        '[Points] Chain reset detected! Old:',
        state.chain_genesis_hash,
        'New:',
        currentHash,
      );
      console.warn('[Points] Resetting last_tx_sequence to 0');
      // TODO: Decide whether to archive/purge old activity_points on chain reset.
      // Currently old points are preserved (intentional for devnet), but users
      // can accumulate duplicate points if they repeat activities on the new chain.
      await pointsDb`
        UPDATE processing_state
        SET last_tx_sequence = 0, chain_genesis_hash = ${currentHash}, processed_at = NOW()
        WHERE scanner_id = 'main'
      `;
    } else if (!state?.chain_genesis_hash) {
      await pointsDb`
        UPDATE processing_state
        SET chain_genesis_hash = ${currentHash}
        WHERE scanner_id = 'main'
      `;
    }
  } catch (err) {
    console.error('[Points] Chain reset detection error:', err);
  }
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

async function processBatch(batch: RawEvent[]): Promise<number> {
  if (!pointsDb) return 0;

  const inserts: {
    wallet_address: string;
    identity_id: string | null;
    tx_digest: string;
    tx_sequence_number: number;
    category: string;
    activity_type: string;
    base_points: number;
    volume_tier: number;
    genesis_multiplier: number;
    final_points: string; // NUMERIC as string for precision
    tx_timestamp: Date;
    event_seq: number;
  }[] = [];

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

  if (inserts.length === 0) return 0;

  // Bulk insert with ON CONFLICT DO NOTHING (idempotent)
  await pointsDb`
    INSERT INTO activity_points ${pointsDb(inserts, 'wallet_address', 'identity_id', 'tx_digest', 'tx_sequence_number', 'category', 'activity_type', 'base_points', 'volume_tier', 'genesis_multiplier', 'final_points', 'tx_timestamp', 'event_seq')}
    ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
  `;

  return inserts.length;
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

    const data = (await res.json()) as {
      wallets?: Record<string, string>;
      genesisPass?: string[];
    };

    if (data.wallets) {
      const newMap = new Map<string, string>();
      for (const [addr, id] of Object.entries(data.wallets)) {
        newMap.set(addr.toLowerCase(), id);
      }
      registeredWallets = newMap;
    }

    if (data.genesisPass) {
      genesisPassHolders = new Set(data.genesisPass);
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
  };
}
