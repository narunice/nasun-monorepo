/**
 * Trader preset -- autonomous NBTC/NUSDC trading on Pado (DeepBook v3).
 *
 * Cycle:
 *   1. Fetch agent NBTC/NUSDC balances
 *   2. Build market context prompt
 *   3. Call Baram /execute (LLM decision + AER auto-issued)
 *   4. Parse JSON decision (BUY/SELL/HOLD + sizeNUSDC + reason)
 *   5. If BUY/SELL, execute DeepBook swap PTB signed by agent
 *   6. Track trade digest in agent-runner local memory (used in next prompt)
 *
 * AER policy (per project decision A):
 *   - Each cycle issues exactly one AER with category='ai_inference'.
 *   - The DEX trade is a separate PTB; its digest is logged but not embedded
 *     in the AER. Future iteration: link via AER.triggered_action.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

import type { StrategyPreset } from './strategies.js';
import type { ActionCallSpecWire } from '../host-client.js';

// ===== Devnet constants (NBTC/NUSDC pool) =====
export const TRADER_CONFIG = {
  pool: '0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0',
  baseType: '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nbtc::NBTC',
  quoteType: '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC',
  deepType: '0x71afcf8eaeb282bad050ef78931205a15c9e49638f2a7c67bde2c372251e1c3e::deep::DEEP',
  deepbookPackage: '0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134',
  baseDecimals: 8,
  quoteDecimals: 6,
  // User decision: medium (per-trade 2 NUSDC, daily 20 NUSDC)
  perTradeMaxQuoteRaw: 2_000_000n,    // 2 NUSDC
  dailyMaxQuoteRaw: 20_000_000n,      // 20 NUSDC
  clockId: '0x6',
};

export interface TradeDecision {
  action: 'BUY' | 'SELL' | 'HOLD';
  sizeNUSDC: number;
  reason: string;
  /** Soft-rail tag describing why a non-HOLD decision was demoted/clamped.
   *  Set when the LLM's raw reply violated a risk limit and the runner
   *  fixed it locally rather than failing the cycle. The original LLM
   *  reason is preserved in `reason`; this string carries the
   *  runner-side annotation so it can land in the AER's replay_extras. */
  riskGate?: string;
}

/** Risk limits the trader applies to LLM output before passing it to
 *  /execute-capability. These mirror the on-chain capability hard rails
 *  (cap.risk_limits) but live client-side so out-of-range LLM replies are
 *  demoted to a documented HOLD instead of bouncing off the host. */
export interface TradeRiskLimits {
  /** Per-trade cap in NUSDC raw units (u64). */
  maxNotionalQuoteRaw: bigint;
  /** Daily aggregate cap in NUSDC raw units (u64). */
  dailyMaxQuoteRaw: bigint;
  /** Max slippage the LLM is allowed to embed in trade.swap.v1 payloads;
   *  not enforced on the agent-signed swap (which already passes 0) but
   *  recorded in the cognition AER. */
  maxSlippageBps: number;
}

export interface TradeRecord {
  ts: number;
  action: 'BUY' | 'SELL';
  sizeQuoteRaw: bigint;
  digest: string;
}

// ===== In-memory daily tracker (resets on agent-runner restart) =====
const tradeHistory: TradeRecord[] = [];

export function dailySpentQuoteRaw(now = Date.now()): bigint {
  const dayStart = now - 24 * 3600 * 1000;
  return tradeHistory
    .filter((r) => r.ts >= dayStart)
    .reduce((acc, r) => acc + r.sizeQuoteRaw, 0n);
}

// ===== Balance fetch =====
//
// Returned totals are the union of:
//   - the agent's owned wallet (used for NSN gas; legacy stuck trade coins
//     for pre-escrow-funding agents also live here)
//   - the on-chain AgentEscrow's `dynamic_field<TypeName, Balance<T>>` (where
//     `withdraw_for_action` actually sources from)
//
// Without merging the escrow side, the trader/analyst prompt would report
// "0 NUSDC" right after a successful escrow deposit and refuse to BUY — the
// exact behaviour the 2026-05-20 Santa-agent Telegram chat exposed:
//
//   "you have NUSDC in escrow" -> agent: "NUSDC balance is 0, cannot trade"
//
// On-chain spend authority lives on the escrow side, so it is the truth for
// decision making. Wallet positions are added on top because legacy agents
// (created before phase-1 escrow funding shipped) hold trade coins there.
export async function fetchAgentBalances(
  client: SuiClient,
  agentAddr: string,
  escrowId?: string | null,
): Promise<{ nbtcRaw: bigint; nusdcRaw: bigint }> {
  const [nbtc, nusdc] = await Promise.all([
    client.getBalance({ owner: agentAddr, coinType: TRADER_CONFIG.baseType }),
    client.getBalance({ owner: agentAddr, coinType: TRADER_CONFIG.quoteType }),
  ]);
  let escrowNbtcRaw = 0n;
  let escrowNusdcRaw = 0n;
  if (escrowId) {
    try {
      const dfs = await client.getDynamicFields({ parentId: escrowId, limit: 50 });
      if (dfs.data.length > 0) {
        const objs = await client.multiGetObjects({
          ids: dfs.data.map((d) => d.objectId),
          options: { showContent: true },
        });
        for (const obj of objs) {
          const content = obj.data?.content as
            | { fields?: { value?: string | number; name?: { fields?: { name?: string } } } }
            | undefined;
          const rawName = content?.fields?.name?.fields?.name;
          if (!rawName) continue;
          const typeName = rawName.startsWith('0x') ? rawName : `0x${rawName}`;
          const value = BigInt(content?.fields?.value ?? '0');
          if (typeName === TRADER_CONFIG.baseType) {
            escrowNbtcRaw = value;
          } else if (typeName === TRADER_CONFIG.quoteType) {
            escrowNusdcRaw = value;
          }
        }
      }
    } catch (err) {
      // Soft-fail: escrow read failure should not break the cycle, but it
      // does degrade the decision quality. Log so it's diagnosable.
      // eslint-disable-next-line no-console
      console.warn(`[trader] escrow balance read failed: ${(err as Error).message}`);
    }
  }
  return {
    nbtcRaw: BigInt(nbtc.totalBalance) + escrowNbtcRaw,
    nusdcRaw: BigInt(nusdc.totalBalance) + escrowNusdcRaw,
  };
}

// ===== Prompt =====
export interface TraderPromptContext {
  agentAddr: string;
  nbtcRaw: bigint;
  nusdcRaw: bigint;
  perTradeMaxQuoteRaw: bigint;
  dailyMaxQuoteRaw: bigint;
  dailySpentRaw: bigint;
  recent: TradeRecord[];
  /** Strategy persona spliced as a system fragment ahead of the per-cycle
   *  market context. Keeping the strategy fragment first makes the
   *  prompt_template_hash sensitive to preset changes -- a verifier can
   *  attribute the AER to a specific preset without re-running the model. */
  strategy: StrategyPreset;
  /** Optional ISO timestamp override for deterministic test rendering.
   *  Production uses Date.now(). */
  nowIso?: string;
  /** Optional user-provided prompt template (from browser TraderConfig).
   *  When set, replaces the strategy.systemPrompt fragment entirely. */
  customSystemPrompt?: string | null;
}

export function buildTraderPrompt(ctx: TraderPromptContext): string {
  const nbtc = (Number(ctx.nbtcRaw) / 1e8).toFixed(8);
  const nusdc = (Number(ctx.nusdcRaw) / 1e6).toFixed(6);
  const perTradeCap = Number(ctx.perTradeMaxQuoteRaw) / 1e6;
  const dailyCap = Number(ctx.dailyMaxQuoteRaw) / 1e6;
  const dailySpent = Number(ctx.dailySpentRaw) / 1e6;
  const dailyRemaining = Math.max(0, dailyCap - dailySpent);

  const recent = ctx.recent.slice(-3)
    .map((r) => `  - ${new Date(r.ts).toISOString()} ${r.action} ${(Number(r.sizeQuoteRaw)/1e6).toFixed(4)} NUSDC eq (${r.digest.slice(0,8)})`)
    .join('\n') || '  (none)';

  const strategyBlock = ctx.customSystemPrompt
    ? `# Custom policy (user-defined)\n${ctx.customSystemPrompt}`
    : `# Strategy preset: ${ctx.strategy.label} (${ctx.strategy.id})\n${ctx.strategy.systemPrompt}`;

  return [
    strategyBlock,
    ``,
    `# Market context`,
    `You are an autonomous DeFi trader on Pado DEX (Nasun devnet, NBTC/NUSDC, DeepBook v3).`,
    `Time: ${ctx.nowIso ?? new Date().toISOString()}`,
    `Wallet: ${ctx.agentAddr}`,
    `Holdings: ${nbtc} NBTC, ${nusdc} NUSDC`,
    `Per-trade size cap: ${perTradeCap} NUSDC equivalent`,
    `Daily cap: ${dailyCap} NUSDC ; spent today: ${dailySpent.toFixed(4)} ; remaining: ${dailyRemaining.toFixed(4)}`,
    `Recent trades:`,
    recent,
    ``,
    `Decide ONE action this cycle. Output STRICT JSON only, no commentary, no code fences:`,
    `{"action":"BUY"|"SELL"|"HOLD","sizeNUSDC":<number, 0 to ${perTradeCap}>,"reason":"<one short sentence>"}`,
    ``,
    `Rules:`,
    `- BUY swaps NUSDC -> NBTC (requires NUSDC balance >= sizeNUSDC).`,
    `- SELL swaps NBTC -> NUSDC (requires non-zero NBTC).`,
    `- If chosen action is impossible due to balance, return HOLD.`,
    `- sizeNUSDC must not exceed remaining daily cap (${dailyRemaining.toFixed(4)}).`,
    `- This is a devnet prototype. No real market data is provided; choose conservatively.`,
  ].join('\n');
}

// ===== Decision parsing =====
/**
 * Parse the LLM's JSON response and apply risk-limit validation. Out-of-range
 * decisions are demoted to HOLD with a `riskGate` annotation rather than
 * thrown -- the trader still wants to issue an AER recording why the cycle
 * produced no trade, otherwise the on-chain record loses the rejection signal.
 *
 * Throws ONLY on shape errors (no JSON, missing action, NaN size). The
 * caller treats throws as "no AER" -- same as before.
 */
export function parseTradeDecision(
  raw: string,
  limits?: TradeRiskLimits,
  context?: { dailySpentQuoteRaw: bigint; nbtcBalanceRaw: bigint; nusdcBalanceRaw: bigint },
): TradeDecision {
  const m = raw.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error(`No JSON in LLM response: ${raw.slice(0, 200)}`);
  const obj = JSON.parse(m[0]);
  if (!['BUY', 'SELL', 'HOLD'].includes(obj.action)) {
    throw new Error(`Invalid action: ${obj.action}`);
  }
  const sizeNUSDC = Number(obj.sizeNUSDC ?? 0);
  if (!Number.isFinite(sizeNUSDC) || sizeNUSDC < 0) {
    throw new Error(`Invalid sizeNUSDC: ${obj.sizeNUSDC}`);
  }
  const reason = String(obj.reason ?? '').slice(0, 200);

  const decision: TradeDecision = {
    action: obj.action,
    sizeNUSDC,
    reason,
  };

  if (!limits || decision.action === 'HOLD') return decision;

  const sizeRaw = BigInt(Math.floor(sizeNUSDC * 1_000_000));
  const dailySpent = context?.dailySpentQuoteRaw ?? 0n;

  // Notional cap. The on-chain hard rail also enforces this against
  // payment_amount; we mirror it for the swap input the runner will sign.
  if (sizeRaw > limits.maxNotionalQuoteRaw) {
    return {
      action: 'HOLD',
      sizeNUSDC: 0,
      reason,
      riskGate: `size_exceeds_notional_cap: requested ${sizeNUSDC} > cap ${
        Number(limits.maxNotionalQuoteRaw) / 1_000_000
      }`,
    };
  }

  // Daily aggregate cap. Demoting to HOLD rather than clamping -- clamping
  // a max-size decision down to the remaining daily window would put a
  // tiny trade on the books that the LLM never asked for.
  if (dailySpent + sizeRaw > limits.dailyMaxQuoteRaw) {
    return {
      action: 'HOLD',
      sizeNUSDC: 0,
      reason,
      riskGate: `daily_cap_would_exceed: spent ${
        Number(dailySpent) / 1_000_000
      } + ${sizeNUSDC} > cap ${Number(limits.dailyMaxQuoteRaw) / 1_000_000}`,
    };
  }

  // Balance feasibility. Same as the existing check in executeTrade(), but
  // catches it at parse time so the AER outcome reflects the rejection.
  if (context) {
    if (decision.action === 'BUY' && context.nusdcBalanceRaw < sizeRaw) {
      return {
        action: 'HOLD',
        sizeNUSDC: 0,
        reason,
        riskGate: `insufficient_quote_balance: have ${
          Number(context.nusdcBalanceRaw) / 1_000_000
        } NUSDC, need ${sizeNUSDC}`,
      };
    }
    if (decision.action === 'SELL' && context.nbtcBalanceRaw <= 0n) {
      return {
        action: 'HOLD',
        sizeNUSDC: 0,
        reason,
        riskGate: 'sell_with_zero_base_balance',
      };
    }
  }

  return decision;
}

// ===== Trade execution =====
export interface TradeExecResult {
  digest: string;
  action: 'BUY' | 'SELL';
  sizeQuoteRaw: bigint;
  description: string;
}

export async function executeTrade(
  client: SuiClient,
  keypair: Ed25519Keypair,
  decision: TradeDecision,
  balances: { nbtcRaw: bigint; nusdcRaw: bigint },
): Promise<TradeExecResult | null> {
  if (decision.action === 'HOLD') return null;

  const sizeQuoteRaw = BigInt(Math.floor(decision.sizeNUSDC * 1e6));
  if (sizeQuoteRaw <= 0n) return null;

  if (sizeQuoteRaw > TRADER_CONFIG.perTradeMaxQuoteRaw) {
    throw new Error(
      `Trade size ${decision.sizeNUSDC} NUSDC exceeds per-trade cap ${Number(TRADER_CONFIG.perTradeMaxQuoteRaw) / 1e6}`,
    );
  }
  const dailySpent = dailySpentQuoteRaw();
  if (dailySpent + sizeQuoteRaw > TRADER_CONFIG.dailyMaxQuoteRaw) {
    throw new Error(
      `Daily cap exceeded: spent ${Number(dailySpent) / 1e6} + ${decision.sizeNUSDC} > ${Number(TRADER_CONFIG.dailyMaxQuoteRaw) / 1e6}`,
    );
  }

  const sender = keypair.toSuiAddress();
  const tx = new Transaction();

  // DEEP coin: zero (Pado pools are whitelisted, fee = 0)
  const [zeroDeep] = tx.moveCall({
    target: '0x2::coin::zero',
    typeArguments: [TRADER_CONFIG.deepType],
  });

  if (decision.action === 'BUY') {
    if (balances.nusdcRaw < sizeQuoteRaw) {
      throw new Error(`Insufficient NUSDC for BUY: have ${balances.nusdcRaw}, need ${sizeQuoteRaw}`);
    }
    const quoteCoinId = await firstCoinId(client, sender, TRADER_CONFIG.quoteType);
    const [quoteCoin] = tx.splitCoins(tx.object(quoteCoinId), [tx.pure.u64(sizeQuoteRaw)]);
    const [baseOut, quoteOut, deepOut] = tx.moveCall({
      target: `${TRADER_CONFIG.deepbookPackage}::pool::swap_exact_quote_for_base`,
      typeArguments: [TRADER_CONFIG.baseType, TRADER_CONFIG.quoteType],
      arguments: [
        tx.object(TRADER_CONFIG.pool),
        quoteCoin,
        zeroDeep,
        tx.pure.u64(0n), // min_base_out: 0 for prototype (no slippage protection in v0)
        tx.object(TRADER_CONFIG.clockId),
      ],
    });
    tx.transferObjects([baseOut, quoteOut, deepOut], tx.pure.address(sender));
  } else {
    // SELL: swap NBTC -> NUSDC. Approximate base size from quote cap by NBTC fraction.
    // TODO(slippage): this ignores oracle price + uses min_base_out=0. On a thin
    // pool the per-trade NUSDC cap does not bound the NBTC outflow. Follow-up:
    // fetch pool mid from get_quote_quantity_out, derive sizeBaseRaw from it,
    // and pass non-zero min_quote_out for slippage protection.
    if (balances.nbtcRaw <= 0n) {
      throw new Error('SELL requested but NBTC balance is 0');
    }
    const fraction = Number(sizeQuoteRaw) / Number(TRADER_CONFIG.perTradeMaxQuoteRaw);
    const sizeBaseRaw = BigInt(Math.floor(Number(balances.nbtcRaw) * Math.max(fraction, 0.0001)));
    if (sizeBaseRaw <= 0n) throw new Error('SELL: computed NBTC size is 0');

    const baseCoinId = await firstCoinId(client, sender, TRADER_CONFIG.baseType);
    const [baseCoin] = tx.splitCoins(tx.object(baseCoinId), [tx.pure.u64(sizeBaseRaw)]);
    const [baseOut, quoteOut, deepOut] = tx.moveCall({
      target: `${TRADER_CONFIG.deepbookPackage}::pool::swap_exact_base_for_quote`,
      typeArguments: [TRADER_CONFIG.baseType, TRADER_CONFIG.quoteType],
      arguments: [
        tx.object(TRADER_CONFIG.pool),
        baseCoin,
        zeroDeep,
        tx.pure.u64(0n),
        tx.object(TRADER_CONFIG.clockId),
      ],
    });
    tx.transferObjects([baseOut, quoteOut, deepOut], tx.pure.address(sender));
  }

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: result.digest });
  if (result.effects?.status.status !== 'success') {
    throw new Error(`Trade PTB failed: ${JSON.stringify(result.effects?.status)}`);
  }

  const record: TradeRecord = {
    ts: Date.now(),
    action: decision.action,
    sizeQuoteRaw,
    digest: result.digest,
  };
  tradeHistory.push(record);

  return {
    digest: result.digest,
    action: decision.action,
    sizeQuoteRaw,
    description: `${decision.action} ~${decision.sizeNUSDC} NUSDC eq`,
  };
}

export function recentTrades(): TradeRecord[] {
  return [...tradeHistory];
}

/**
 * Build the wire shape of the swap ActionCallSpec the host PTB builder
 * will consume on /execute-capability. Pipe sentinels mark where the
 * host substitutes Cmd 0's withdraw_coin and Cmd 1's zero_deep returns.
 *
 * direction:
 *   BUY  → swap_exact_quote_for_base (NUSDC -> NBTC), pool input is quote
 *   SELL → swap_exact_base_for_quote (NBTC -> NUSDC), pool input is base
 *
 * minOut: u64 raw of the minimum acceptable output coin. For v1 we pass
 * 0 (no slippage guard) consistent with the pre-Plan-C trader; phase 2
 * mid-price + slippage_bps lift comes via pado-swap.ts on the host.
 */
export function buildSwapActionCall(args: {
  direction: 'BUY' | 'SELL';
  poolId?: string;
  deepbookPackage?: string;
  baseType?: string;
  quoteType?: string;
  minOut?: bigint;
}): ActionCallSpecWire {
  const poolId = args.poolId ?? TRADER_CONFIG.pool;
  const pkg = args.deepbookPackage ?? TRADER_CONFIG.deepbookPackage;
  const base = args.baseType ?? TRADER_CONFIG.baseType;
  const quote = args.quoteType ?? TRADER_CONFIG.quoteType;
  const minOut = args.minOut ?? 0n;
  const fn =
    args.direction === 'BUY' ? 'swap_exact_quote_for_base' : 'swap_exact_base_for_quote';
  return {
    targetPackage: pkg,
    module: 'pool',
    fn,
    typeArguments: [base, quote],
    args: [
      { kind: 'object', id: poolId },
      { kind: 'pipe', from: 'withdraw_coin' },
      { kind: 'pipe', from: 'zero_deep' },
      { kind: 'pure', bytes: bcsU64Base64(minOut) },
      { kind: 'object', id: '0x6' },
    ],
  };
}

function bcsU64Base64(v: bigint): string {
  const out = new Uint8Array(8);
  let x = v;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return Buffer.from(out).toString('base64');
}

const DEV_INSPECT_SENDER =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Devnet-quote a `min_out` for the trader's swap. Mirrors the host's
 * `pado-swap.ts:quoteExpectedOutput` + `applySlippageFloor` so a trader-
 * supplied `min_out` clears the host's HIGH #2 floor check on the first
 * try. devInspect-only; no real signer or gas needed.
 *
 *   BUY  (sizeInRaw=NUSDC): calls get_quantity_out(0, sizeInRaw, clock),
 *                           returns baseOut * (10000-bps)/10000
 *   SELL (sizeInRaw=NBTC):  calls get_quantity_out(sizeInRaw, 0, clock),
 *                           returns quoteOut * (10000-bps)/10000
 *
 * Throws fail-closed on devInspect transport/shape error so the cycle
 * defers rather than submitting a too-loose floor.
 */
export async function quoteMinOut(args: {
  client: SuiClient;
  direction: 'BUY' | 'SELL';
  sizeInRaw: bigint;
  slippageBps: number;
}): Promise<bigint> {
  const { client, direction, sizeInRaw, slippageBps } = args;
  if (sizeInRaw <= 0n) throw new Error('quoteMinOut: sizeInRaw must be > 0');
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
    throw new Error('quoteMinOut: slippageBps must be in [0, 10000]');
  }
  const baseQuantity = direction === 'SELL' ? sizeInRaw : 0n;
  const quoteQuantity = direction === 'BUY' ? sizeInRaw : 0n;

  const tx = new Transaction();
  tx.moveCall({
    target: `${TRADER_CONFIG.deepbookPackage}::pool::get_quantity_out`,
    typeArguments: [TRADER_CONFIG.baseType, TRADER_CONFIG.quoteType],
    arguments: [
      tx.object(TRADER_CONFIG.pool),
      tx.pure.u64(baseQuantity),
      tx.pure.u64(quoteQuantity),
      tx.object(TRADER_CONFIG.clockId),
    ],
  });

  const result = await client.devInspectTransactionBlock({
    sender: DEV_INSPECT_SENDER,
    transactionBlock: tx,
  });
  if (result.effects?.status?.status !== 'success') {
    throw new Error(
      `quoteMinOut: get_quantity_out devInspect failed: ${result.effects?.status?.error ?? 'unknown'}`,
    );
  }
  const returnValues = result.results?.[0]?.returnValues;
  if (!returnValues || returnValues.length < 3) {
    throw new Error('quoteMinOut: get_quantity_out returned fewer than 3 values');
  }
  const decodeU64LE = (idx: number): bigint => {
    const raw = returnValues[idx]?.[0];
    if (!raw || raw.length !== 8) {
      throw new Error(`quoteMinOut: return[${idx}] expected 8-byte u64, got ${raw?.length}`);
    }
    let v = 0n;
    for (let i = 0; i < 8; i++) v |= BigInt(raw[i]) << BigInt(i * 8);
    return v;
  };
  const expected = direction === 'BUY' ? decodeU64LE(0) : decodeU64LE(1);
  return (expected * BigInt(10_000 - slippageBps)) / 10_000n;
}

async function firstCoinId(client: SuiClient, owner: string, coinType: string): Promise<string> {
  const r = await client.getCoins({ owner, coinType, limit: 1 });
  if (r.data.length === 0) {
    throw new Error(`No ${coinType.split('::').pop()} coin owned by ${owner}`);
  }
  return r.data[0].coinObjectId;
}
