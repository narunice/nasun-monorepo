/**
 * Startup preflight checks for pado bots.
 *
 * Catches token/faucet misconfiguration before the bot starts trading.
 *
 * The check that matters most (the one we missed for ~11 days in the
 * 2026-05-18 NETH liquidity incident): "does the faucet object this market is
 * pointed at actually hold a TreasuryCap of the type this market trades?"
 *
 * If a token package is re-published and the faucet wiring is not updated to
 * point at the new TreasuryCap, the bot will silently mint stale-type coins
 * forever. DeepBook will refuse them. Trading inventory will stay empty even
 * though logs say "REFILLED: +N TOKEN". `verifyMarketFaucet` makes that case
 * fatal at startup with a precise diff.
 */
import { SuiClient } from '@mysten/sui/client';

/**
 * Minimal market shape needed for faucet verification. Both `MarketConfig`
 * (lib/config.ts) and the standalone configs in scripts/prefund-bot.ts +
 * scripts/balance-watchdog.ts satisfy this. Keeping it narrow lets scripts
 * call the preflight without importing the full bot-runtime config surface.
 */
export interface FaucetCheckable {
  name: string;
  baseType: string;
  faucetType: 'v1' | 'v2';
  faucetV2Object?: string;
}

export interface PreflightOptions {
  /** RPC endpoint. Defaults to the bot's NASUN_RPC_URL. */
  rpcUrl?: string;
}

/**
 * Verify that `market.faucetV2Object` holds a TreasuryCap whose minted coin
 * type equals `market.baseType`. Throws with a clear error if not.
 *
 * Only meaningful for v2 markets. v1 markets are no-ops.
 */
export async function verifyMarketFaucet(
  market: FaucetCheckable,
  opts: PreflightOptions = {},
): Promise<void> {
  if (market.faucetType !== 'v2') return;
  if (!market.faucetV2Object) {
    throw new Error(`[preflight] ${market.name}: faucetType=v2 but faucetV2Object is missing`);
  }

  const rpcUrl = opts.rpcUrl || process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
  const client = new SuiClient({ url: rpcUrl });

  const obj = await client.getObject({
    id: market.faucetV2Object,
    options: { showContent: true, showType: true },
  });
  if (!obj.data) {
    throw new Error(`[preflight] ${market.name}: faucet object ${market.faucetV2Object} not found on chain`);
  }

  // The faucet stores one TreasuryCap per supported coin under a field whose
  // type signature includes `TreasuryCap<TYPE>`. We look for *any* cap whose
  // generic argument matches our baseType. We do NOT assume a particular field
  // name (some faucets call it `neth_cap`, others bundle both).
  const content = obj.data.content;
  if (!content || content.dataType !== 'moveObject') {
    throw new Error(`[preflight] ${market.name}: faucet object has no readable content`);
  }
  const fields = (content as { fields?: Record<string, unknown> }).fields ?? {};

  const treasuryCapTypes = collectTreasuryCapTypes(fields);
  if (treasuryCapTypes.length === 0) {
    throw new Error(
      `[preflight] ${market.name}: faucet object ${market.faucetV2Object} ` +
      `holds no TreasuryCap fields (object type: ${obj.data.type ?? 'unknown'})`,
    );
  }

  const expected = normalizeType(market.baseType);
  const found = treasuryCapTypes.map(normalizeType);
  if (!found.includes(expected)) {
    throw new Error(
      `[preflight] ${market.name}: faucet/baseType mismatch.\n` +
      `  baseType:    ${market.baseType}\n` +
      `  faucet:      ${market.faucetV2Object}\n` +
      `  faucet mints: ${treasuryCapTypes.join(', ')}\n` +
      `Update faucetV2Package / faucetV2Object in MARKETS.${market.name} to ` +
      `point at a faucet whose TreasuryCap matches baseType.`,
    );
  }
}

/** Verify all v2 markets the caller passes in. Aggregates errors. */
export async function verifyMarketFaucets(
  markets: FaucetCheckable[],
  opts: PreflightOptions = {},
): Promise<void> {
  const errors: string[] = [];
  for (const m of markets) {
    try {
      await verifyMarketFaucet(m, opts);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (errors.length > 0) {
    throw new Error(`Preflight failed for ${errors.length} market(s):\n\n${errors.join('\n\n')}`);
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Walk a Move object's deserialized fields and return the inner type argument
 * of every `TreasuryCap<...>` field encountered. The Sui SDK exposes the field
 * type either inline (when verbose decoding is on) or as nested object data
 * with a `type` string we can match.
 */
function collectTreasuryCapTypes(fields: Record<string, unknown>): string[] {
  const found: string[] = [];
  for (const v of Object.values(fields)) {
    const t = extractTreasuryCapInner(v);
    if (t) found.push(t);
  }
  return found;
}

function extractTreasuryCapInner(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  // Pattern 1: nested move object with a `type` string.
  const type = typeof obj.type === 'string' ? obj.type : null;
  if (type) {
    const m = type.match(/::coin::TreasuryCap<(.+)>$/);
    if (m) return m[1];
  }
  // Pattern 2: nested `fields` containing a typed sub-object.
  if (obj.fields && typeof obj.fields === 'object') {
    return extractTreasuryCapInner(obj.fields);
  }
  return null;
}

function normalizeType(t: string): string {
  return t.startsWith('0x') ? t : `0x${t}`;
}
