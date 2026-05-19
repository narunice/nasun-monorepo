/**
 * LP endpoints for the BankrollPool surface (Tier 1.2).
 *
 *   GET /api/gostop/lp/pool-state             — chain-derived pool stats (30s cache)
 *   GET /api/gostop/lp/apy                    — 7d rolling APY estimate (60s cache)
 *   GET /api/gostop/lp/positions/:address     — LPTokens owned by address (no cache)
 *   GET /api/gostop/lp/cooldown/:lpTokenId    — withdraw cooldown state for one LPToken
 *
 * Aggregate fields are derived from chain via sui_getObject / sui_getOwnedObjects.
 * The bankrollPnl ledger (gostop.bankroll_event) backs the APY estimate; share
 * price comes straight from chain because indexer only tracks total_shares
 * (plan v3 §3.F — chain is the SoT for pool.balance).
 *
 * Plan: ~/.claude/plans/tier1-chunk2-bankroll-pnl-sot.md v3 §3.E, §4 (post-PR-B).
 */

import { Hono } from 'hono';
import { rpcCall } from '../../rpc.js';
import { BANKROLL_POOL } from '../../config/contracts.js';
import { cacheGet, cacheSet } from '../lib/cache.js';
import { bankrollPnl, type DataQuality } from '../lib/bankroll-pnl.js';

const POOL_STATE_TTL_SECONDS = 30;
const APY_TTL_SECONDS = 60;
const APY_WINDOW_DAYS = 7;
const APY_WINDOW_MS = APY_WINDOW_DAYS * 86_400_000;
const WINDOW_QUANTUM_MS = 30_000;

// LPToken type tag is bound to the originalPackageId since the struct is
// defined in v0.0.2 (unchanged in v0.0.3 upgrade). Sui Move event/object
// type tags ALWAYS use the package that introduced the struct.
const LP_TOKEN_TYPE = `${BANKROLL_POOL.originalPackageId}::bankroll_pool::LPToken`;

const EXIT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // mirrors bankroll_pool.move:EXIT_COOLDOWN_MS

const SHARE_PRICE_SCALE = 1_000_000_000n;

const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{1,64}$/;

export const lpRoutes = new Hono();

// ---------- helpers --------------------------------------------------------

interface PoolFields {
  balance?: string | number;
  total_shares?: string | number;
  paused?: boolean;
}

async function fetchPoolFields(): Promise<PoolFields | null> {
  try {
    const res = await rpcCall<{
      data?: { content?: { fields?: PoolFields } };
    }>('sui_getObject', [
      BANKROLL_POOL.bankrollPoolObjectId,
      { showContent: true },
    ]);
    return res?.data?.content?.fields ?? null;
  } catch (err) {
    console.warn(
      `[lp] sui_getObject(BankrollPool) failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function calcSharePriceScaled(balance: bigint, shares: bigint): bigint {
  if (shares === 0n) return SHARE_PRICE_SCALE;
  return (balance * SHARE_PRICE_SCALE) / shares;
}

// ---------- GET /pool-state ------------------------------------------------

lpRoutes.get('/pool-state', async (c) => {
  const cacheKey = `lp:pool-state`;
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) {
    const ifNoneMatch = c.req.header('if-none-match');
    if (ifNoneMatch && ifNoneMatch === cached.etag) {
      c.header('ETag', cached.etag);
      return c.body(null, 304);
    }
    c.header('ETag', cached.etag);
    c.header('Cache-Control', `public, max-age=${POOL_STATE_TTL_SECONDS}`);
    return c.json(cached.value);
  }

  const fields = await fetchPoolFields();
  if (!fields || fields.balance === undefined || fields.total_shares === undefined) {
    // Chain unreachable — UI should treat this as 'unreliable' and disable
    // deposit/withdraw entry points. Return 200 with a degraded marker so
    // a frontend cache miss does not show a hard error to the user.
    const payload = {
      data_quality: 'unreliable' as DataQuality,
      pool_balance: '0',
      total_shares: '0',
      share_price_scaled: SHARE_PRICE_SCALE.toString(),
      is_seeded: false,
      paused: false,
      generated_at: Date.now(),
    };
    // No cacheSet on failure — next request retries chain immediately.
    return c.json(payload);
  }

  const balance = BigInt(String(fields.balance));
  const shares = BigInt(String(fields.total_shares));
  const sharePrice = calcSharePriceScaled(balance, shares);

  const payload = {
    data_quality: 'fresh' as DataQuality,
    pool_balance: balance.toString(),
    total_shares: shares.toString(),
    share_price_scaled: sharePrice.toString(),
    is_seeded: shares > 0n,
    paused: fields.paused === true,
    generated_at: Date.now(),
  };

  const etag = cacheSet(cacheKey, payload, POOL_STATE_TTL_SECONDS);
  c.header('ETag', etag);
  c.header('Cache-Control', `public, max-age=${POOL_STATE_TTL_SECONDS}`);
  return c.json(payload);
});

// ---------- GET /apy -------------------------------------------------------

lpRoutes.get('/apy', async (c) => {
  // Quantize window so the cache key rotates exactly when TTL expires (no
  // mid-TTL stampede). Matches transparency endpoint's quantization scheme.
  const toMs = Math.floor(Date.now() / WINDOW_QUANTUM_MS) * WINDOW_QUANTUM_MS;
  const fromMs = toMs - APY_WINDOW_MS;
  const cacheKey = `lp:apy:${toMs}`;
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) {
    const ifNoneMatch = c.req.header('if-none-match');
    if (ifNoneMatch && ifNoneMatch === cached.etag) {
      c.header('ETag', cached.etag);
      return c.body(null, 304);
    }
    c.header('ETag', cached.etag);
    c.header('Cache-Control', `public, max-age=${APY_TTL_SECONDS}`);
    return c.json(cached.value);
  }

  let pnl;
  try {
    pnl = await bankrollPnl({ fromMs, toMs });
  } catch (err) {
    console.warn(
      `[lp] bankrollPnl failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return c.json({
      window_days: APY_WINDOW_DAYS,
      apy_pct: null,
      net_pnl: '0',
      data_quality: 'unreliable' as DataQuality,
      cursor_lag_ms: 0,
      tvl_approx: '0',
      note: 'apy_pct is null when data_quality !== "fresh"; UI must label as estimate.',
      generated_at: Date.now(),
    });
  }

  // Current TVL approximation: use current pool.balance as a proxy for the
  // mean TVL over the window. Plan v3 §10.E acknowledges this is a v1
  // simplification — historical TVL would require chain replay. Pre-LP-UI
  // there is no LP capital so pool.balance ~= seed + accrued PnL, slowly
  // varying. Once LP deposits start landing, this approximation degrades
  // and we should switch to time-weighted average from the bankroll_event
  // running balance (deferred to v1.x).
  const poolFields = await fetchPoolFields();
  const tvl = poolFields?.balance ? BigInt(String(poolFields.balance)) : 0n;
  const netPnl = BigInt(pnl.net_pnl);

  // Annualized APY: (net_pnl / tvl) * (365 / 7) * 100. Compute in BigInt
  // basis points to keep precision, then convert to fixed-point string.
  // Returns null when tvl = 0 or data_quality is not 'fresh' (we cannot
  // claim an annualized number while data is stale).
  let apyPct: number | null = null;
  if (pnl.data_quality === 'fresh' && tvl > 0n) {
    // ratio_bps = net_pnl * 10000 / tvl  (NUSDC base units cancel)
    const ratioBpsScaled = (netPnl * 10_000n * 36_500n) / (tvl * BigInt(APY_WINDOW_DAYS));
    // ratioBpsScaled is now (apy * 10000) — divide by 100 for percent.
    apyPct = Number(ratioBpsScaled) / 100;
  }

  const payload = {
    window_days: APY_WINDOW_DAYS,
    apy_pct: apyPct,
    net_pnl: pnl.net_pnl,
    tvl_approx: tvl.toString(),
    data_quality: pnl.data_quality,
    cursor_lag_ms: pnl.cursor_lag_ms,
    note: 'apy_pct uses current TVL as window mean approximation; v1 only.',
    generated_at: Date.now(),
  };

  const etag = cacheSet(cacheKey, payload, APY_TTL_SECONDS);
  c.header('ETag', etag);
  c.header('Cache-Control', `public, max-age=${APY_TTL_SECONDS}`);
  return c.json(payload);
});

// ---------- GET /positions/:address ----------------------------------------

interface LpTokenFields {
  id?: { id?: string };
  shares?: string | number;
  deposit_time?: string | number;
  withdraw_requested_at?: string | number | null;
}

interface OwnedObject {
  data?: {
    objectId?: string;
    type?: string;
    content?: { fields?: LpTokenFields };
  };
}

lpRoutes.get('/positions/:address', async (c) => {
  const address = c.req.param('address');
  if (!SUI_ADDRESS_RE.test(address)) {
    return c.json({ error: 'bad_request', reason: 'invalid_address' }, 400);
  }

  // Page through sui_getOwnedObjects filtered by LPToken type. Typical user
  // owns at most a handful, so a single page (limit=50) is plenty.
  interface OwnedObjectsPage {
    data: OwnedObject[];
    nextCursor: string | null;
    hasNextPage: boolean;
  }
  let owned: OwnedObject[] = [];
  try {
    let cursor: string | null = null;
    while (true) {
      const res: OwnedObjectsPage = await rpcCall<OwnedObjectsPage>(
        'suix_getOwnedObjects',
        [
          address,
          {
            filter: { StructType: LP_TOKEN_TYPE },
            options: { showContent: true, showType: true },
          },
          cursor,
          50,
        ],
      );
      owned = owned.concat(res.data ?? []);
      if (!res.hasNextPage) break;
      cursor = res.nextCursor;
      if (cursor === null) break;
    }
  } catch (err) {
    console.warn(
      `[lp] suix_getOwnedObjects failed for ${address}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return c.json({
      address,
      positions: [],
      data_quality: 'unreliable' as DataQuality,
      generated_at: Date.now(),
    });
  }

  // Need pool state to estimate per-position NUSDC value.
  const poolFields = await fetchPoolFields();
  const poolBalance = poolFields?.balance ? BigInt(String(poolFields.balance)) : 0n;
  const poolShares = poolFields?.total_shares ? BigInt(String(poolFields.total_shares)) : 0n;
  const dataQuality: DataQuality = poolFields ? 'fresh' : 'unreliable';

  const positions = owned.flatMap((o) => {
    const fields = o.data?.content?.fields;
    const id = o.data?.objectId ?? fields?.id?.id;
    if (!fields || !id || fields.shares === undefined) return [];
    const shares = BigInt(String(fields.shares));
    const depositTime = fields.deposit_time ? BigInt(String(fields.deposit_time)) : 0n;
    const requestedAt =
      fields.withdraw_requested_at !== null && fields.withdraw_requested_at !== undefined
        ? BigInt(String(fields.withdraw_requested_at))
        : null;
    // Estimated current NUSDC: shares * (pool_balance + 1) / (total_shares + 1)
    // Mirrors bankroll_pool::redeem_liquidity math so the UI quote matches
    // what redeem would actually pay (modulo rounding).
    const estNusdc =
      poolShares > 0n
        ? (shares * (poolBalance + 1n)) / (poolShares + 1n)
        : 0n;
    const claimableAt = requestedAt !== null ? requestedAt + BigInt(EXIT_COOLDOWN_MS) : null;
    return [
      {
        lp_token_id: id,
        shares: shares.toString(),
        estimated_value_nusdc: estNusdc.toString(),
        deposit_time_ms: depositTime.toString(),
        withdraw_requested_at_ms: requestedAt !== null ? requestedAt.toString() : null,
        claimable_at_ms: claimableAt !== null ? claimableAt.toString() : null,
      },
    ];
  });

  return c.json({
    address,
    positions,
    data_quality: dataQuality,
    generated_at: Date.now(),
  });
});

// ---------- GET /cooldown/:lpTokenId ---------------------------------------

lpRoutes.get('/cooldown/:lpTokenId', async (c) => {
  const id = c.req.param('lpTokenId');
  if (!SUI_ADDRESS_RE.test(id)) {
    return c.json({ error: 'bad_request', reason: 'invalid_object_id' }, 400);
  }

  try {
    const res = await rpcCall<{
      data?: { content?: { fields?: LpTokenFields }; type?: string };
      error?: { code?: string };
    }>('sui_getObject', [id, { showContent: true, showType: true }]);
    const type = res?.data?.type;
    if (!type || !type.includes('::bankroll_pool::LPToken')) {
      return c.json({ error: 'not_found', reason: 'not_lptoken' }, 404);
    }
    const fields = res?.data?.content?.fields;
    if (!fields) return c.json({ error: 'not_found' }, 404);

    const shares = fields.shares ? BigInt(String(fields.shares)) : 0n;
    const requestedAt =
      fields.withdraw_requested_at !== null && fields.withdraw_requested_at !== undefined
        ? BigInt(String(fields.withdraw_requested_at))
        : null;
    const claimableAt = requestedAt !== null ? requestedAt + BigInt(EXIT_COOLDOWN_MS) : null;
    const now = BigInt(Date.now());
    const remainingMs =
      claimableAt !== null && claimableAt > now ? (claimableAt - now).toString() : '0';

    return c.json({
      lp_token_id: id,
      shares: shares.toString(),
      withdraw_requested_at_ms: requestedAt !== null ? requestedAt.toString() : null,
      claimable_at_ms: claimableAt !== null ? claimableAt.toString() : null,
      // Convenience field for the UI countdown component — no need to do bigint
      // math on the client. UI should still recompute against its own clock
      // tick (server-side ms is one-shot at response time).
      remaining_ms: remainingMs,
      // Chain `clock::timestamp_ms` is what redeem_liquidity uses to enforce
      // the cooldown. Validator clock drift is typically <1s vs wall-clock;
      // we expose the server-side now alongside so the UI can detect skew.
      server_now_ms: now.toString(),
    });
  } catch (err) {
    console.warn(
      `[lp] sui_getObject(${id}) failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return c.json({ error: 'rpc_failed' }, 502);
  }
});
