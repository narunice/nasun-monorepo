/**
 * /api/v1/vaults — Nasun Vault (Phase 5 BP) read API.
 *
 * Thin, read-only projection of the tables filled by vault-scanner.ts:
 *   GET /                         — vault list (NAV, manager, depositor count, killed)
 *   GET /:vaultId                 — detail: vault state + trades + fee events + NAV series
 *   GET /:vaultId/depositor/:addr — one address's deposit/withdraw flow history
 *
 * All on-chain state (shares, tier gate, NAV) is authoritative on chain; these
 * endpoints are an indexed convenience view. NUMERIC columns are returned by the
 * `postgres` driver as strings (u128-safe), which is the correct JSON form.
 *
 * Public, IP rate-limited (60 rpm via index.ts). No payload here reveals more
 * than the chain already exposes via the 7 vault events.
 */

import { Hono, type Context } from 'hono';
import { pointsDb } from '../db.js';

const app = new Hono();

// 32-byte Sui object id / address -> 66-char "0x..." (mirrors standing.ts).
const SUI_ID_RE = /^0x[0-9a-f]{64}$/;

function applyPublicCacheHeaders(c: Context): void {
  c.header('Cache-Control', 'public, max-age=30');
}

app.get('/', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_db_unavailable' }, 503);

  const rows = await pointsDb`
    SELECT
      v.vault_id,
      v.manager,
      v.agent_profile_id,
      v.agent_capability_id,
      v.performance_fee_bps,
      v.cooldown_ms,
      v.last_nav_per_share,
      v.high_water_mark_nav,
      v.is_killed,
      v.created_at_ms,
      (
        SELECT COUNT(DISTINCT f.depositor)
        FROM vault_flows f
        WHERE f.vault_id = v.vault_id AND f.flow_type = 'deposit'
      ) AS depositor_count
    FROM vaults v
    ORDER BY v.created_at_ms DESC
  `;

  applyPublicCacheHeaders(c);
  return c.json({ vaults: rows });
});

app.get('/:vaultId', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_db_unavailable' }, 503);

  const vaultId = c.req.param('vaultId').toLowerCase();
  if (!SUI_ID_RE.test(vaultId)) return c.json({ error: 'invalid_vault_id' }, 400);

  const [vault] = await pointsDb`
    SELECT
      vault_id, manager, agent_profile_id, agent_capability_id, balance_manager_id,
      performance_fee_bps, cooldown_ms, initial_seed_nusdc, initial_seed_deep,
      high_water_mark_nav, last_nav_per_share, last_nav_at_ms,
      is_killed, killed_at_ms, created_at_ms, created_tx_digest
    FROM vaults
    WHERE vault_id = ${vaultId}
    LIMIT 1
  `;
  if (!vault) return c.json({ error: 'vault_not_found' }, 404);

  const trades = await pointsDb`
    SELECT
      tx_digest, event_seq, agent_profile_id, capability_id, agent_address,
      pool_id, is_bid, price, qty, fill_notional, nav_after, action_type, timestamp_ms
    FROM vault_trades
    WHERE vault_id = ${vaultId}
    ORDER BY timestamp_ms DESC
    LIMIT 200
  `;

  const fees = await pointsDb`
    SELECT
      tx_digest, event_seq, manager, nav_per_share_at_crystallize,
      previous_hwm, new_hwm, fee_shares_minted, timestamp_ms
    FROM vault_fee_events
    WHERE vault_id = ${vaultId}
    ORDER BY timestamp_ms DESC
    LIMIT 100
  `;

  // NAV series for the chart: every nav-bearing event. Keep the NEWEST 1000
  // (inner DESC + LIMIT), then return oldest-first for plotting.
  const navSeries = await pointsDb`
    SELECT timestamp_ms, nav, source FROM (
      SELECT timestamp_ms, nav_after AS nav, 'trade' AS source
        FROM vault_trades WHERE vault_id = ${vaultId}
      UNION ALL
      SELECT timestamp_ms, nav_per_share AS nav, flow_type AS source
        FROM vault_flows
        WHERE vault_id = ${vaultId} AND nav_per_share IS NOT NULL
      UNION ALL
      SELECT timestamp_ms, nav_per_share_at_crystallize AS nav, 'fee' AS source
        FROM vault_fee_events WHERE vault_id = ${vaultId}
      ORDER BY timestamp_ms DESC
      LIMIT 1000
    ) s
    ORDER BY timestamp_ms ASC
  `;

  applyPublicCacheHeaders(c);
  return c.json({ vault, trades, fees, navSeries });
});

app.get('/:vaultId/depositor/:address', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_db_unavailable' }, 503);

  const vaultId = c.req.param('vaultId').toLowerCase();
  const address = c.req.param('address').toLowerCase();
  if (!SUI_ID_RE.test(vaultId)) return c.json({ error: 'invalid_vault_id' }, 400);
  if (!SUI_ID_RE.test(address)) return c.json({ error: 'invalid_address' }, 400);

  const flows = await pointsDb`
    SELECT
      tx_digest, event_seq, flow_type, shares, nusdc_amount, nbtc_amount,
      nav_per_share, was_emergency, cooldown_until_ms, timestamp_ms
    FROM vault_flows
    WHERE vault_id = ${vaultId} AND depositor = ${address}
    ORDER BY timestamp_ms DESC
  `;

  applyPublicCacheHeaders(c);
  return c.json({ vault_id: vaultId, depositor: address, flows });
});

export default app;
