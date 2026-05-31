/**
 * Nasun Vault (Phase 5 BP) event indexer.
 *
 * Data source: RPC `suix_queryEvents` with a MoveEventModule filter, NOT the
 * sui-indexer Postgres tables. Two reasons:
 *   1. The vault events carry rich payloads (nav_after u128, attribution IDs,
 *      fill_notional, ...). The indexer's `events`/`event_struct_name` tables
 *      expose only struct identity + BCS bytes; RPC returns ready `parsedJson`.
 *   2. The indexer's tx_calls_fun / tx_affected_addresses are pruned and
 *      unreliable for full history (see rpc-reconcile-identity.ts), so RPC is
 *      already the established source for payload-bearing scanners
 *      (rpc-reconcile-identity.ts, settle-games.ts).
 *
 * The MoveEventModule filter `{ package, module: 'vault' }` returns all 7 vault
 * event types in one query; we dispatch by the type suffix. Events use the
 * module's ORIGINAL (defining) package id, so VAULT_PACKAGE_ID must be the
 * original package id, not an upgraded one.
 *
 * Idempotency: every row carries the chain-unique (tx_digest, event_seq) and
 * inserts use ON CONFLICT DO NOTHING. Mutable vault state (NAV, HWM, is_killed)
 * is advanced with monotonic guards so a full re-scan converges to the same
 * final state regardless of crash/restart.
 *
 * Dormant by default: no-ops unless ENABLE_VAULT_SCANNER=true AND
 * VAULT_PACKAGE_ID is set AND POINTS_DATABASE_URL is configured.
 */

import { pointsDb } from '../db.js';
import { rpcCall } from '../rpc.js';

const MODULE = 'vault';
const PAGE_SIZE = 50;
const MAX_PAGES_PER_CYCLE = 40; // bound a single cycle; cursor resumes next tick
const SCAN_INTERVAL_MS = Number(process.env.VAULT_SCAN_INTERVAL_MS ?? 30_000);

// Base58 decode for txDigest -> 0x hex (mirrors rpc-reconcile-identity.ts).
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP = new Map<string, bigint>();
for (let i = 0; i < B58_ALPHABET.length; i++) B58_MAP.set(B58_ALPHABET[i], BigInt(i));
function base58ToHex(b58: string): string {
  let n = 0n;
  for (const c of b58) {
    const v = B58_MAP.get(c);
    if (v === undefined) throw new Error(`Invalid base58 char: ${c}`);
    n = n * 58n + v;
  }
  return `0x${n.toString(16).padStart(64, '0')}`;
}

interface RpcCursor {
  txDigest: string; // base58
  eventSeq: string;
}

interface RpcEvent {
  id: { txDigest: string; eventSeq: string };
  type: string; // 0xpkg::module::Type
  timestampMs?: string;
  parsedJson: Record<string, unknown>;
}

interface RpcQueryResult {
  data: RpcEvent[];
  nextCursor: RpcCursor | null;
  hasNextPage: boolean;
}

// parsedJson coercion helpers. Sui returns u64/u128 as strings, ID/address as
// "0x..", bool as boolean, vector<u8> as a number array.
function str(v: unknown): string {
  return typeof v === 'string' ? v : String(v ?? '');
}
function num(v: unknown): string {
  // Keep as string for lossless NUMERIC insert (u128-safe).
  return str(v);
}
function bool(v: unknown): boolean {
  return v === true || v === 'true';
}
function decodeBytes(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    try {
      return Buffer.from(v as number[]).toString('utf8');
    } catch {
      return '';
    }
  }
  return '';
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function ensureVaultSchema(): Promise<void> {
  if (!pointsDb) return;
  await pointsDb.unsafe(`
    CREATE TABLE IF NOT EXISTS vaults (
      vault_id              text PRIMARY KEY,
      manager               text NOT NULL,
      agent_profile_id      text NOT NULL,
      agent_capability_id   text NOT NULL,
      balance_manager_id    text NOT NULL,
      performance_fee_bps   bigint NOT NULL,
      cooldown_ms           bigint NOT NULL,
      initial_seed_nusdc    numeric NOT NULL,
      initial_seed_deep     numeric NOT NULL,
      high_water_mark_nav   numeric,
      last_nav_per_share    numeric,
      last_nav_at_ms        bigint,
      is_killed             boolean NOT NULL DEFAULT false,
      killed_at_ms          bigint,
      created_at_ms         bigint NOT NULL,
      created_tx_digest     text NOT NULL,
      updated_at            timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pointsDb.unsafe(`
    CREATE TABLE IF NOT EXISTS vault_trades (
      tx_digest          text NOT NULL,
      event_seq          bigint NOT NULL,
      vault_id           text NOT NULL,
      agent_profile_id   text NOT NULL,
      capability_id      text NOT NULL,
      agent_address      text NOT NULL,
      pool_id            text NOT NULL,
      is_bid             boolean NOT NULL,
      price              numeric NOT NULL,
      qty                numeric NOT NULL,
      fill_notional      numeric NOT NULL,
      nav_after          numeric NOT NULL,
      action_type        text NOT NULL,
      timestamp_ms       bigint NOT NULL,
      PRIMARY KEY (tx_digest, event_seq)
    )
  `);
  await pointsDb.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_vault_trades_vault_ts
      ON vault_trades(vault_id, timestamp_ms DESC)`);
  await pointsDb.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_vault_trades_agent_profile
      ON vault_trades(agent_profile_id)`);
  await pointsDb.unsafe(`
    CREATE TABLE IF NOT EXISTS vault_flows (
      tx_digest          text NOT NULL,
      event_seq          bigint NOT NULL,
      vault_id           text NOT NULL,
      depositor          text NOT NULL,
      flow_type          text NOT NULL,
      shares             numeric NOT NULL,
      nusdc_amount       numeric NOT NULL DEFAULT 0,
      nbtc_amount        numeric NOT NULL DEFAULT 0,
      nav_per_share      numeric,
      was_emergency      boolean NOT NULL DEFAULT false,
      cooldown_until_ms  bigint,
      timestamp_ms       bigint NOT NULL,
      PRIMARY KEY (tx_digest, event_seq)
    )
  `);
  await pointsDb.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_vault_flows_vault_ts
      ON vault_flows(vault_id, timestamp_ms DESC)`);
  await pointsDb.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_vault_flows_depositor
      ON vault_flows(vault_id, depositor)`);
  await pointsDb.unsafe(`
    CREATE TABLE IF NOT EXISTS vault_fee_events (
      tx_digest                     text NOT NULL,
      event_seq                     bigint NOT NULL,
      vault_id                      text NOT NULL,
      manager                       text NOT NULL,
      nav_per_share_at_crystallize  numeric NOT NULL,
      previous_hwm                  numeric NOT NULL,
      new_hwm                       numeric NOT NULL,
      fee_shares_minted             numeric NOT NULL,
      timestamp_ms                  bigint NOT NULL,
      PRIMARY KEY (tx_digest, event_seq)
    )
  `);
  await pointsDb.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_vault_fee_events_vault_ts
      ON vault_fee_events(vault_id, timestamp_ms DESC)`);
  await pointsDb.unsafe(`
    CREATE TABLE IF NOT EXISTS vault_scan_state (
      id                 int PRIMARY KEY DEFAULT 1,
      cursor_tx_digest   text,
      cursor_event_seq   text,
      updated_at         timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT vault_scan_state_singleton CHECK (id = 1)
    )
  `);
  console.log('[vault-scanner] schema ready');
}

async function loadCursor(): Promise<RpcCursor | null> {
  if (!pointsDb) return null;
  const [row] = await pointsDb`
    SELECT cursor_tx_digest, cursor_event_seq FROM vault_scan_state WHERE id = 1`;
  if (!row || !row.cursor_tx_digest) return null;
  return { txDigest: row.cursor_tx_digest as string, eventSeq: row.cursor_event_seq as string };
}

async function saveCursor(cursor: RpcCursor): Promise<void> {
  if (!pointsDb) return;
  await pointsDb`
    INSERT INTO vault_scan_state (id, cursor_tx_digest, cursor_event_seq, updated_at)
    VALUES (1, ${cursor.txDigest}, ${cursor.eventSeq}, now())
    ON CONFLICT (id) DO UPDATE
      SET cursor_tx_digest = ${cursor.txDigest},
          cursor_event_seq = ${cursor.eventSeq},
          updated_at = now()`;
}

async function handleEvent(ev: RpcEvent): Promise<void> {
  if (!pointsDb) return;
  const typeName = ev.type.split('::').pop() ?? '';
  const p = ev.parsedJson ?? {};
  let txDigest: string;
  try {
    txDigest = base58ToHex(ev.id.txDigest);
  } catch {
    return;
  }
  const eventSeq = Number(ev.id.eventSeq);
  const ts = num(p.timestamp_ms ?? ev.timestampMs);

  switch (typeName) {
    case 'VaultCreated': {
      // DO NOTHING on conflict: created once, never overwrite accumulated state.
      await pointsDb`
        INSERT INTO vaults (
          vault_id, manager, agent_profile_id, agent_capability_id,
          balance_manager_id, performance_fee_bps, cooldown_ms,
          initial_seed_nusdc, initial_seed_deep, created_at_ms, created_tx_digest
        ) VALUES (
          ${str(p.vault_id)}, ${str(p.manager)}, ${str(p.agent_profile_id)},
          ${str(p.agent_capability_id)}, ${str(p.balance_manager_id)},
          ${num(p.performance_fee_bps)}, ${num(p.cooldown_ms)},
          ${num(p.initial_seed_nusdc)}, ${num(p.initial_seed_deep)},
          ${ts}, ${txDigest}
        ) ON CONFLICT (vault_id) DO NOTHING`;
      break;
    }
    case 'DepositEvent': {
      await pointsDb`
        INSERT INTO vault_flows (
          tx_digest, event_seq, vault_id, depositor, flow_type,
          shares, nusdc_amount, nav_per_share, timestamp_ms
        ) VALUES (
          ${txDigest}, ${eventSeq}, ${str(p.vault_id)}, ${str(p.depositor)}, 'deposit',
          ${num(p.shares_minted)}, ${num(p.nusdc_in)}, ${num(p.nav_per_share)}, ${ts}
        ) ON CONFLICT (tx_digest, event_seq) DO NOTHING`;
      await updateNav(str(p.vault_id), num(p.nav_per_share), ts);
      break;
    }
    case 'WithdrawRequested': {
      await pointsDb`
        INSERT INTO vault_flows (
          tx_digest, event_seq, vault_id, depositor, flow_type,
          shares, cooldown_until_ms, timestamp_ms
        ) VALUES (
          ${txDigest}, ${eventSeq}, ${str(p.vault_id)}, ${str(p.depositor)}, 'withdraw_requested',
          ${num(p.shares)}, ${num(p.cooldown_until_ms)}, ${num(p.request_at_ms)}
        ) ON CONFLICT (tx_digest, event_seq) DO NOTHING`;
      break;
    }
    case 'WithdrawClaimed': {
      await pointsDb`
        INSERT INTO vault_flows (
          tx_digest, event_seq, vault_id, depositor, flow_type,
          shares, nusdc_amount, nbtc_amount, nav_per_share, was_emergency, timestamp_ms
        ) VALUES (
          ${txDigest}, ${eventSeq}, ${str(p.vault_id)}, ${str(p.depositor)}, 'withdraw_claimed',
          ${num(p.shares)}, ${num(p.nusdc_out)}, ${num(p.nbtc_out)},
          ${num(p.nav_per_share)}, ${bool(p.was_emergency)}, ${ts}
        ) ON CONFLICT (tx_digest, event_seq) DO NOTHING`;
      await updateNav(str(p.vault_id), num(p.nav_per_share), ts);
      break;
    }
    case 'TradeExecuted': {
      await pointsDb`
        INSERT INTO vault_trades (
          tx_digest, event_seq, vault_id, agent_profile_id, capability_id,
          agent_address, pool_id, is_bid, price, qty, fill_notional,
          nav_after, action_type, timestamp_ms
        ) VALUES (
          ${txDigest}, ${eventSeq}, ${str(p.vault_id)}, ${str(p.agent_profile_id)},
          ${str(p.capability_id)}, ${str(p.agent_address)}, ${str(p.pool_id)},
          ${bool(p.is_bid)}, ${num(p.price)}, ${num(p.qty)}, ${num(p.fill_notional)},
          ${num(p.nav_after)}, ${decodeBytes(p.action_type)}, ${ts}
        ) ON CONFLICT (tx_digest, event_seq) DO NOTHING`;
      await updateNav(str(p.vault_id), num(p.nav_after), ts);
      break;
    }
    case 'FeeCrystallized': {
      await pointsDb`
        INSERT INTO vault_fee_events (
          tx_digest, event_seq, vault_id, manager, nav_per_share_at_crystallize,
          previous_hwm, new_hwm, fee_shares_minted, timestamp_ms
        ) VALUES (
          ${txDigest}, ${eventSeq}, ${str(p.vault_id)}, ${str(p.manager)},
          ${num(p.nav_per_share_at_crystallize)}, ${num(p.previous_hwm)},
          ${num(p.new_hwm)}, ${num(p.fee_shares_minted)}, ${ts}
        ) ON CONFLICT (tx_digest, event_seq) DO NOTHING`;
      // HWM rises monotonically.
      await pointsDb`
        UPDATE vaults
          SET high_water_mark_nav = ${num(p.new_hwm)}, updated_at = now()
          WHERE vault_id = ${str(p.vault_id)}
            AND (high_water_mark_nav IS NULL OR high_water_mark_nav <= ${num(p.new_hwm)})`;
      await updateNav(str(p.vault_id), num(p.nav_per_share_at_crystallize), ts);
      break;
    }
    case 'VaultKilled': {
      await pointsDb`
        UPDATE vaults
          SET is_killed = true, killed_at_ms = ${ts}, updated_at = now()
          WHERE vault_id = ${str(p.vault_id)}`;
      break;
    }
    default:
      // Unknown vault event type; ignore (forward-compatible).
      break;
  }
}

// Advance latest-known NAV with a monotonic-by-timestamp guard so out-of-order
// replays (full re-scan) converge to the chronologically-last value.
async function updateNav(vaultId: string, nav: string, ts: string): Promise<void> {
  if (!pointsDb || !vaultId || !nav) return;
  await pointsDb`
    UPDATE vaults
      SET last_nav_per_share = ${nav}, last_nav_at_ms = ${ts}, updated_at = now()
      WHERE vault_id = ${vaultId}
        AND (last_nav_at_ms IS NULL OR last_nav_at_ms <= ${ts})`;
}

async function runCycle(packageId: string): Promise<void> {
  if (running || !pointsDb) return;
  running = true;
  try {
    let cursor = await loadCursor();
    const filter = { MoveEventModule: { package: packageId, module: MODULE } };

    for (let page = 0; page < MAX_PAGES_PER_CYCLE; page++) {
      let result: RpcQueryResult;
      try {
        result = await rpcCall<RpcQueryResult>('suix_queryEvents', [
          filter,
          cursor,
          PAGE_SIZE,
          false, // ascending: oldest first, resume forward
        ]);
      } catch (err) {
        console.warn(`[vault-scanner] RPC error: ${(err as Error).message}`);
        break;
      }
      if (!result || result.data.length === 0) break;

      for (const ev of result.data) {
        try {
          await handleEvent(ev);
        } catch (err) {
          // Do NOT swallow: advancing the cursor past a failed insert would drop
          // the event permanently. Rethrow to abort the cycle. The cursor stays
          // at the last fully-processed page, and the idempotent ON CONFLICT
          // inserts make the full retry next tick safe. A persistent failure
          // (poison event) stalls the cursor visibly in logs rather than
          // silently losing data.
          console.error(
            `[vault-scanner] handle ${ev.type} (${ev.id?.txDigest}:${ev.id?.eventSeq}) failed, aborting cycle:`,
            (err as Error).message,
          );
          throw err;
        }
      }

      // Persist cursor only after the whole page is processed, so a crash
      // mid-page re-reads it next cycle (inserts are idempotent). A null
      // nextCursor means end-of-stream even if hasNextPage is (transiently)
      // true, so break rather than re-fetching the same page in a tight loop.
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
      await saveCursor(cursor);
      if (!result.hasNextPage) break;
    }
  } finally {
    running = false;
  }
}

export async function startVaultScanner(): Promise<void> {
  if (process.env.ENABLE_VAULT_SCANNER !== 'true') {
    console.log('[vault-scanner] disabled (set ENABLE_VAULT_SCANNER=true)');
    return;
  }
  const packageId = process.env.VAULT_PACKAGE_ID;
  if (!packageId) {
    console.log('[vault-scanner] VAULT_PACKAGE_ID not set, skipping (pre-publish)');
    return;
  }
  if (!pointsDb) {
    console.warn('[vault-scanner] pointsDb unavailable, skipping');
    return;
  }
  // Await schema before the first cycle to avoid the cold-start race that bit
  // nsi-compute / agent-leaderboard (sync start + sync ensureSchema).
  await ensureVaultSchema();

  timer = setInterval(() => {
    runCycle(packageId).catch((err) =>
      console.error('[vault-scanner] cycle failed', err),
    );
  }, SCAN_INTERVAL_MS);
  runCycle(packageId).catch((err) =>
    console.error('[vault-scanner] initial run failed', err),
  );
  console.log(`[vault-scanner] started (pkg=${packageId}, interval=${SCAN_INTERVAL_MS}ms)`);
}

export function stopVaultScanner(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
