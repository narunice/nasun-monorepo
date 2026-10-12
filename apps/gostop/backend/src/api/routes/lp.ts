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
import {
  SHARE_PRICE_SCALE,
  calcSharePriceScaled,
  computeApyPct,
  computeRealizedPct,
  computeRedeemQuoteRaw,
} from '../lib/bankroll-pool-math.js';
import { reader } from '../../db/client.js';
import { isValidSuiAddress } from '../auth/wallet-sig.js';

const POOL_STATE_TTL_SECONDS = 30;
const APY_TTL_SECONDS = 60;
/** Negative cache for a failed chain read: bounds the stale '0' without
 *  letting an RPC outage turn every request into a fresh CTE + retry chain. */
const APY_FAILED_READ_TTL_SECONDS = 5;

/** Seconds a cache entry still has to live, floored at 0. */
function remainingMaxAge(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}
const APY_WINDOW_DAYS = 7;
/**
 * Windows reported alongside the primary one, so the LP page can show that a
 * single week is mostly variance. Each costs one more CTE and one more chain
 * read, both issued in parallel, and all of them land in the same cache entry.
 * Keep this short: it is a per-request fan-out, not a free field.
 */
const EXTRA_RETURN_WINDOW_DAYS = [30] as const;
const WINDOW_QUANTUM_MS = 30_000;

// LPToken type tag is bound to the originalPackageId since the struct is
// defined in v0.0.2 (unchanged in v0.0.3 upgrade). Sui Move event/object
// type tags ALWAYS use the package that introduced the struct.
const LP_TOKEN_TYPE = `${BANKROLL_POOL.originalPackageId}::bankroll_pool::LPToken`;

const EXIT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // mirrors bankroll_pool.move:EXIT_COOLDOWN_MS

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
  const cacheKey = `lp:apy:${toMs}`;
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) {
    const ifNoneMatch = c.req.header('if-none-match');
    if (ifNoneMatch && ifNoneMatch === cached.etag) {
      c.header('ETag', cached.etag);
      return c.body(null, 304);
    }
    c.header('ETag', cached.etag);
    // Remaining life, not the nominal TTL: a failed chain read is stored under
    // APY_FAILED_READ_TTL_SECONDS, and echoing the 60s figure would let
    // Cloudflare and browsers hold that entry's tvl_approx '0' for a full
    // minute, undoing the negative cache downstream.
    c.header('Cache-Control', `public, max-age=${remainingMaxAge(cached.expiresAt)}`);
    return c.json(cached.value);
  }

  // Every reported window, primary first. Resolved as one list so each result
  // stays paired with the day count that produced it; two parallel arrays
  // indexed against each other would silently mislabel a window if either
  // changed. They run in parallel, so the added latency is one round-trip
  // rather than one per window.
  const windowDays = [APY_WINDOW_DAYS, ...EXTRA_RETURN_WINDOW_DAYS];

  // allSettled rather than all: a secondary window must not be able to take
  // the primary one down with it. The 30d scan covers roughly four times the
  // rows of the 7d one and is the likelier of the two to time out, and under
  // Promise.all that discarded a perfectly good 7d reading in favour of the
  // degraded payload below. That payload is also the one branch here that
  // never caches, so a slow 30d scan would have re-run both CTEs and both RPC
  // retry chains on every request for as long as it stayed slow.
  // Only the primary reads the chain. Every window divides by that one
  // balance, so a secondary read would be discarded, and while the RPC is
  // down each one would still spin up its own retry chain on the 5s negative
  // cache path below.
  const settled = await Promise.allSettled(
    windowDays.map((days, i) =>
      bankrollPnl({ fromMs: toMs - days * 86_400_000, toMs }, { skipChainRead: i > 0 }),
    ),
  );

  const primary = settled[0];
  if (primary.status === 'rejected') {
    const err = primary.reason;
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
      // Empty rather than absent: the UI branches on each window's
      // realized_pct being null, and an absent array would make a failed
      // aggregate indistinguishable from a deploy that predates `windows`.
      windows: [],
      note: 'apy_pct is null when data_quality !== "fresh"; UI must label as estimate.',
      generated_at: Date.now(),
    });
  }

  // Primary window. Its chain read supplies the TVL every window divides by.
  const pnl = primary.value;

  // Current TVL approximation: use current pool.balance as a proxy for the
  // mean TVL over the window. Plan v3 §10.E acknowledges this is a v1
  // simplification — historical TVL would require chain replay. Pre-LP-UI
  // there is no LP capital so pool.balance ~= seed + accrued PnL, slowly
  // varying. Once LP deposits start landing, this approximation degrades
  // and we should switch to time-weighted average from the bankroll_event
  // running balance (deferred to v1.x).
  //
  // The balance comes from the chain read the primary `bankrollPnl` already
  // performed, so the route adds no sui_getObject of its own and the extra
  // windows skip the read entirely. One denominator for every window also
  // keeps the percentages comparable, which two reads taken milliseconds
  // apart would not.
  //
  // A null means that read failed. `apy_pct` goes null for it, but
  // `tvl_approx` still serializes as '0' because the field is a string and the
  // catch branch above already reports '0' on total failure; the distinction
  // between a failed read and a drained pool lives in `data_quality`, which is
  // 'unreliable' in exactly that case. Consumers must read data_quality before
  // tvl_approx. Note this also means a transient RPC failure now reports 0
  // where the previous second read could have returned the real balance; that
  // is the cost of dropping the duplicate call, and data_quality flags it.
  const tvl = pnl.pool_balance_raw !== null ? BigInt(pnl.pool_balance_raw) : null;
  const netPnl = BigInt(pnl.net_pnl);

  // Annualized APY as percent with two-decimal precision. The arithmetic
  // lives in bankroll-pool-math::computeApyPct; the route owns the upstream
  // data-quality gate so a 'lagging' or 'unreliable' pnl never leaks an
  // APY estimate the user could anchor on.
  const apyPct = pnl.data_quality === 'fresh' && tvl !== null
    ? computeApyPct(netPnl, tvl, APY_WINDOW_DAYS)
    : null;

  // What the LP page renders. `realized_pct` is the window's result with no
  // annualization; `annualized_pct` is the same number scaled by 365/days and
  // is kept for operators, not for display. Both share the primary window's
  // TVL and inherit the same data-quality gate as apy_pct above, so a lagging
  // aggregate cannot leak a figure a depositor would anchor on.
  // A window whose aggregate failed is dropped rather than reported with null
  // figures: the frontend looks each window up by day count and already
  // renders a miss as "requires fresh data", so an omission degrades exactly
  // like a null would without claiming the window was computed.
  const windows = settled.flatMap((s, i) => {
    const days = windowDays[i];
    if (s.status === 'rejected') {
      const err = s.reason;
      console.warn(
        `[lp] bankrollPnl ${days}d window failed, omitting: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
    const windowNetPnl = BigInt(s.value.net_pnl);
    const usable = pnl.data_quality === 'fresh' && tvl !== null;
    return [{
      days,
      net_pnl: s.value.net_pnl,
      realized_pct: usable ? computeRealizedPct(windowNetPnl, tvl!) : null,
      annualized_pct: usable ? computeApyPct(windowNetPnl, tvl!, days) : null,
    }];
  });

  const payload = {
    window_days: APY_WINDOW_DAYS,
    apy_pct: apyPct,
    net_pnl: pnl.net_pnl,
    tvl_approx: tvl !== null ? tvl.toString() : '0',
    data_quality: pnl.data_quality,
    cursor_lag_ms: pnl.cursor_lag_ms,
    windows,
    note: 'realized_pct is the window result as-is; annualized_pct scales it by 365/days and is not for display. TVL is the current pool balance used as the window mean; v1 only.',
    generated_at: Date.now(),
  };

  // A failed chain read gets a short TTL rather than the full one. tvl_approx is
  // a non-nullable string, so the failure serializes as '0', and holding that
  // for 60s shows a drained pool to any consumer not branching on data_quality.
  // Serving it uncached instead would drop the only stampede guard here: every
  // public request would re-run the 7-day CTE and the rpcCall retry chain for
  // as long as the RPC stayed down. A few seconds bounds the stale zero while
  // keeping the herd off.
  const ttl = tvl === null ? APY_FAILED_READ_TTL_SECONDS : APY_TTL_SECONDS;
  const etag = cacheSet(cacheKey, payload, ttl);
  c.header('ETag', etag);
  c.header('Cache-Control', `public, max-age=${ttl}`);
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
  if (!isValidSuiAddress(address)) {
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

  // Resolve original deposit amount per LPToken so the UI can show PnL. The
  // chain LPToken object stores only shares + deposit_time, so we join on
  // (actor, timestamp_ms, shares) against bankroll_event.liquidity_provided.
  // The triple is effectively unique — two deposits at the same ms with the
  // exact same share count is astronomically unlikely.
  //
  // Scoped to the live pool (migration 009) so a deposit into the pool retired
  // by the v8 fresh genesis can never supply the amount for a live LPToken.
  // The positions themselves come from chain and were never affected; this
  // keeps the one DB-sourced field on the same footing.
  const depositRows = await reader()<{ ts: string; shares: string; amount: string }[]>`
    SELECT timestamp_ms::text AS ts,
           shares::text       AS shares,
           amount::text       AS amount
    FROM gostop.bankroll_event
    WHERE event_type = 'liquidity_provided'
      AND actor = ${address}
      AND pool_object_id = ${BANKROLL_POOL.bankrollPoolObjectId}
  `;
  const depositLookup = new Map<string, string>();
  for (const row of depositRows) {
    depositLookup.set(`${row.ts}:${row.shares}`, row.amount);
  }

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
    // Estimated current NUSDC mirrors bankroll_pool::redeem_liquidity so the
    // UI quote matches what redeem would actually pay (modulo rounding).
    const estNusdc = computeRedeemQuoteRaw(shares, poolBalance, poolShares);
    const claimableAt = requestedAt !== null ? requestedAt + BigInt(EXIT_COOLDOWN_MS) : null;
    const depositAmount = depositLookup.get(`${depositTime.toString()}:${shares.toString()}`) ?? null;
    return [
      {
        lp_token_id: id,
        shares: shares.toString(),
        estimated_value_nusdc: estNusdc.toString(),
        deposit_amount_nusdc: depositAmount,
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
  if (!isValidSuiAddress(id)) {
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
