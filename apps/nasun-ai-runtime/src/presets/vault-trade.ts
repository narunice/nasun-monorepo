/**
 * Vault preset -- autonomous NBTC/NUSDC trading on a *managed* Nasun Vault
 * (packages/nasun-vault, Phase 5).
 *
 * Why this is a separate path from the trader preset:
 *   The trader preset trades the agent's OWN escrow funds and routes the
 *   actual on-chain settle through the host /execute-capability Lambda
 *   (the agent key only produces sig2). The vault's on-chain
 *   `execute_trade` instead asserts `sender == vault.manager ||
 *   sender == vault.agent_address` (vault.move:637-638), so the trade PTB
 *   MUST be signed directly by the agent's own keypair -- the Lambda
 *   executor is a different address and would be rejected. This module
 *   therefore mirrors the runtime's dormant direct-sign `executeTrade`
 *   path (trader.ts:408), not the Plan C escrow flow.
 *
 * Decision (v1):
 *   A pure mean-reversion band over (live pool reference price vs the
 *   vault's own last_mark_price). On a dip it accumulates (BUY); a SELL
 *   is emitted only when allowSell is enabled (default off -- BUY-only
 *   accumulation is balance-safe without reading the vault's NBTC
 *   holdings, which live inside the wrapped BalanceManager Bag and are
 *   not exposed by a non-test view fn). `decideVaultTrade` is a pure
 *   function so an LLM decision can replace it later without touching the
 *   builder/signer below.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

import { TRADER_CONFIG } from './trader.js';

// ===== Devnet constants (nasun_vault Phase 5) =====
// Hardcoded to mirror TRADER_CONFIG's style (the runtime has no
// @nasun/devnet-config dependency). Source of truth:
//   packages/devnet-config/devnet-ids.json -> nasunVault.packageId,
//   nasunTier.registry. Bump these if the vault is re-published.
export const VAULT_CONFIG = {
  packageId: '0x6a622d90d2ce81c19affc2a73aa6df2d85c691db97a63d1fe589e788d61f16b0',
  tierRegistryId:
    '0x9d67cc044e51e86173b001548f9e5df493c780d98bfb1d7e31f074b1fa0a86d0',
  // DeepBook NBTC/NUSDC order granularity (pado network.ts:166, on-chain
  // verified): tick = $0.10 in price-raw units, lot = 0.00001 NBTC.
  tickSize: 100_000n,
  lotSize: 1_000n,
};

const DEV_INSPECT_SENDER =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

// Price-raw scale for NBTC/NUSDC = 10^(quoteDecimals + 9 - baseDecimals)
// = 10^(6 + 9 - 8) = 10^7. A human USD price of 71,746 -> 717_460_000_000.
// NAV_SCALE (1e9) is the on-chain notional divisor: price*qty/1e9.
const NAV_SCALE = 1_000_000_000n;

export type VaultAction = 'BUY' | 'SELL' | 'HOLD';

export interface VaultState {
  isKilled: boolean;
  lastMarkRaw: bigint;
  managerAddress: string;
  agentAddress: string;
  capabilityId: string;
  poolId: string;
  agentProfileId: string;
}

export interface VaultTradeDecision {
  action: VaultAction;
  /** Signed basis points: (refPrice - lastMark) / lastMark * 10000. */
  deviationBps: number;
  reason: string;
}

export interface VaultOrderParams {
  isBid: boolean;
  priceRaw: bigint;
  qtyRaw: bigint;
  notionalRaw: bigint;
}

// ===== On-chain reads =====

/**
 * Read the managed vault's scalar fields from its object content. The
 * test-only getters (nbtc_balance/last_mark_price/is_killed) are not in
 * the published bytecode, but the underlying struct fields are exposed by
 * getObject(showContent). NBTC/NUSDC free balances are intentionally NOT
 * read here (they sit in the wrapped BalanceManager Bag).
 */
export async function readVaultState(
  client: SuiClient,
  vaultId: string,
): Promise<VaultState> {
  const obj = await client.getObject({
    id: vaultId,
    options: { showContent: true },
  });
  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
    throw new Error(`Vault ${vaultId} not found or non-Move`);
  }
  const f = obj.data.content.fields as Record<string, unknown>;
  const str = (k: string): string => {
    const v = f[k];
    if (typeof v !== 'string') throw new Error(`Vault field ${k} missing/non-string`);
    return v;
  };
  return {
    isKilled: f.is_killed === true,
    lastMarkRaw: BigInt(str('last_mark_price')),
    managerAddress: str('manager'),
    agentAddress: str('agent_address'),
    capabilityId: str('agent_capability_id'),
    poolId: str('allowed_base_pool_id'),
    agentProfileId: str('agent_profile_id'),
  };
}

/**
 * Live reference price (price-raw, x1e7) from a small sell-side devInspect
 * probe of `pool::get_quantity_out(probeBase, 0, clock)`. This is the
 * realizable bid-side price for a tiny taker, close enough to mid for a
 * band signal. Mirrors trader.ts:quoteBaseInForQuoteOut's probe shape.
 *
 *   price_raw = quoteOut_raw * 100 * 1e7 / probeBaseRaw
 *
 * Throws fail-closed on devInspect transport/shape error so the cycle
 * defers rather than trading on a bad quote.
 */
export async function quoteReferenceRaw(client: SuiClient): Promise<bigint> {
  const probeBaseRaw = 100_000_000n; // 1 NBTC
  const tx = new Transaction();
  tx.moveCall({
    target: `${TRADER_CONFIG.deepbookPackage}::pool::get_quantity_out`,
    typeArguments: [TRADER_CONFIG.baseType, TRADER_CONFIG.quoteType],
    arguments: [
      tx.object(TRADER_CONFIG.pool),
      tx.pure.u64(probeBaseRaw),
      tx.pure.u64(0n),
      tx.object(TRADER_CONFIG.clockId),
    ],
  });
  const result = await client.devInspectTransactionBlock({
    sender: DEV_INSPECT_SENDER,
    transactionBlock: tx,
  });
  if (result.effects?.status?.status !== 'success') {
    throw new Error(
      `quoteReferenceRaw: get_quantity_out devInspect failed: ${result.effects?.status?.error ?? 'unknown'}`,
    );
  }
  const returnValues = result.results?.[0]?.returnValues;
  if (!returnValues || returnValues.length < 3) {
    throw new Error('quoteReferenceRaw: get_quantity_out returned fewer than 3 values');
  }
  const quoteOutRaw = decodeU64LE(returnValues[1]?.[0]);
  if (quoteOutRaw <= 0n) {
    throw new Error('quoteReferenceRaw: pool returned zero quote out (no liquidity?)');
  }
  // price_raw (x1e7) = quoteOut_raw / (probeBase / 1e8) * 1e7
  //                  = quoteOut_raw * 100 * 1e7 / probeBaseRaw
  return (quoteOutRaw * 100n * 10_000_000n) / probeBaseRaw;
}

function decodeU64LE(raw: number[] | undefined): bigint {
  if (!raw || raw.length !== 8) {
    throw new Error(`expected 8-byte u64, got ${raw?.length}`);
  }
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(raw[i]) << BigInt(i * 8);
  return v;
}

// ===== Pure decision + order math (unit-tested) =====

export interface DecideInput {
  isKilled: boolean;
  lastMarkRaw: bigint;
  refPriceRaw: bigint;
  bandBps: number;
  allowSell: boolean;
}

/**
 * Mean-reversion band. Pure. The seam an LLM decision would replace.
 */
export function decideVaultTrade(input: DecideInput): VaultTradeDecision {
  if (input.isKilled) {
    return { action: 'HOLD', deviationBps: 0, reason: 'vault is killed' };
  }
  if (input.lastMarkRaw <= 0n || input.refPriceRaw <= 0n) {
    return { action: 'HOLD', deviationBps: 0, reason: 'invalid price inputs' };
  }
  // A never-traded vault initializes last_mark_price to the NAV "1.0"
  // sentinel (NAV_SCALE = 1e9, vault.move:354), NOT a real price-raw value
  // (~7e11 for NBTC). Comparing the band against the sentinel yields a
  // nonsense +millions-of-bps deviation, which would HOLD forever (BUY-only)
  // or wrong-SELL. There is no mark to mean-revert against yet, so bootstrap
  // with a single BUY: the on-chain execute_trade seeds last_mark_price from
  // the fill, and subsequent cycles run the real band. Any genuine NBTC
  // price-raw is orders of magnitude above the sentinel, so this never
  // misfires on a seeded vault.
  if (input.lastMarkRaw <= NAV_SCALE) {
    return {
      action: 'BUY',
      deviationBps: 0,
      reason: 'unseeded mark (1.0 sentinel) -> bootstrap accumulate',
    };
  }
  const deviationBps = Number(
    ((input.refPriceRaw - input.lastMarkRaw) * 10_000n) / input.lastMarkRaw,
  );
  if (deviationBps <= -input.bandBps) {
    return {
      action: 'BUY',
      deviationBps,
      reason: `price ${deviationBps}bps below mark -> accumulate`,
    };
  }
  if (deviationBps >= input.bandBps) {
    if (!input.allowSell) {
      return {
        action: 'HOLD',
        deviationBps,
        reason: `price ${deviationBps}bps above mark but SELL disabled`,
      };
    }
    return {
      action: 'SELL',
      deviationBps,
      reason: `price ${deviationBps}bps above mark -> trim`,
    };
  }
  return { action: 'HOLD', deviationBps, reason: `within +/-${input.bandBps}bps band` };
}

/**
 * Translate a BUY/SELL decision + reference price into an IOC limit order.
 * The vault places IOC (taker-only) orders, so the price must cross the
 * book: a BUY bid is lifted above the reference (rounded UP to a tick), a
 * SELL ask is dropped below it (rounded DOWN). qty is floored to a lot.
 * Pure.
 */
export function computeOrderParams(args: {
  action: 'BUY' | 'SELL';
  refPriceRaw: bigint;
  slippageBps: number;
  stepQtyRaw: bigint;
}): VaultOrderParams {
  const { action, refPriceRaw, slippageBps, stepQtyRaw } = args;
  const isBid = action === 'BUY';
  const slipped = isBid
    ? (refPriceRaw * BigInt(10_000 + slippageBps)) / 10_000n
    : (refPriceRaw * BigInt(10_000 - slippageBps)) / 10_000n;
  const priceRaw = isBid
    ? ceilTo(slipped, VAULT_CONFIG.tickSize)
    : floorTo(slipped, VAULT_CONFIG.tickSize);
  const qtyRaw = floorTo(stepQtyRaw, VAULT_CONFIG.lotSize);
  const notionalRaw = (priceRaw * qtyRaw) / NAV_SCALE;
  return { isBid, priceRaw, qtyRaw, notionalRaw };
}

function floorTo(v: bigint, step: bigint): bigint {
  return (v / step) * step;
}
function ceilTo(v: bigint, step: bigint): bigint {
  return ((v + step - 1n) / step) * step;
}

// ===== PTB builder =====

export interface ExecuteTradeArgs {
  vaultId: string;
  capabilityId: string;
  poolId: string;
  expectedCapVersion: bigint;
  isBid: boolean;
  priceRaw: bigint;
  qtyRaw: bigint;
  expireTsMs: bigint;
}

/**
 * Build the agent-signed PTB for nasun_vault::vault::execute_trade. The
 * function is non-generic (Pool<NBTC,NUSDC> is concrete) so there are no
 * type arguments. Arg order matches vault.move:622-633 exactly. All shared
 * objects go through tx.object() (mirrors vaultTx.ts / pado buildPlaceLimitOrder).
 */
export function buildExecuteTradeTx(args: ExecuteTradeArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${VAULT_CONFIG.packageId}::vault::execute_trade`,
    arguments: [
      tx.object(args.vaultId),
      tx.object(args.capabilityId),
      tx.object(VAULT_CONFIG.tierRegistryId),
      tx.object(args.poolId),
      tx.pure.u64(args.expectedCapVersion),
      tx.pure.bool(args.isBid),
      tx.pure.u64(args.priceRaw),
      tx.pure.u64(args.qtyRaw),
      tx.pure.u64(args.expireTsMs),
      tx.object(TRADER_CONFIG.clockId),
    ],
  });
  return tx;
}

// ===== Execute / dry-run =====

export interface VaultTradeResult {
  digest: string;
  executedQty: bigint;
  fillNotional: bigint;
  navAfter: bigint;
}

/**
 * Simulate the execute_trade PTB via devInspect (no gas coin, no
 * signature). The sandbox runs every on-chain gate (sender auth, pool/cap
 * binding, cap version, asset allowlist, per-order notional cap, tier) and
 * the DeepBook IOC fill, surfacing a MoveAbort code on failure. Passing the
 * vault's agent_address as `sender` satisfies the sender==agent_address
 * assert. Returns the parsed TradeExecuted event on success.
 */
export async function dryRunVaultTrade(
  client: SuiClient,
  senderAddress: string,
  tx: Transaction,
): Promise<{ ok: boolean; error?: string; event?: Record<string, unknown> }> {
  const res = await client.devInspectTransactionBlock({
    sender: senderAddress,
    transactionBlock: tx,
  });
  if (res.effects?.status?.status !== 'success') {
    return { ok: false, error: res.effects?.status?.error ?? 'unknown' };
  }
  const ev = res.events?.find((e) => e.type.endsWith('::vault::TradeExecuted'));
  return { ok: true, event: ev?.parsedJson as Record<string, unknown> | undefined };
}

/**
 * Sign (agent keypair) + execute the execute_trade PTB. Used only on the
 * live autonomous path; the dry-run verifier above needs no key.
 */
export async function executeVaultTrade(
  client: SuiClient,
  keypair: Ed25519Keypair,
  tx: Transaction,
): Promise<VaultTradeResult> {
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: result.digest });
  if (result.effects?.status.status !== 'success') {
    throw new Error(`execute_trade PTB failed: ${JSON.stringify(result.effects?.status)}`);
  }
  const ev = result.events?.find((e) => e.type.endsWith('::vault::TradeExecuted'));
  const p = (ev?.parsedJson ?? {}) as Record<string, unknown>;
  return {
    digest: result.digest,
    executedQty: BigInt((p.qty as string) ?? '0'),
    fillNotional: BigInt((p.fill_notional as string) ?? '0'),
    navAfter: BigInt((p.nav_after as string) ?? '0'),
  };
}
