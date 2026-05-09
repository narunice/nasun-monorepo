/**
 * Trader Runner — runs ONE trader cycle in the browser.
 *
 * Mirrors agent-runner/src/index.ts runTraderCycle (CLI version) but adapted
 * for the dashboard:
 *   - Uses an in-memory Ed25519Keypair (decrypted from IndexedDB once at start)
 *   - Reads/writes lastTradeDigest in IndexedDB so the chain survives reload
 *   - Calls the operator's executor /execute (host on localhost or wherever)
 *   - Builds and signs the DeepBook swap PTB itself (no Web Worker needed —
 *     PTB build/sign are fast; cycle is <10s of work)
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase58 } from '@mysten/sui/utils';
import { sha256 } from '@noble/hashes/sha256';
import type { TraderConfig, TraderPair } from '../types/trader';

// ===== Devnet trading constants =====
const NBTC_TYPE = '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nbtc::NBTC';
const NUSDC_TYPE = '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC';
const NETH_TYPE = '0xbf33cac7b8ccb22d398a6dedc3e159ed68bc1804bf0726516360e7e0b9dcb474::neth::NETH';
const NSOL_TYPE = '0xd3256ab6c7013402f258870188e15e69bd881c534e913c1ee7d991f4f9e6ab0f::nsol::NSOL';
const NSN_TYPE  = '0xd3256ab6c7013402f258870188e15e69bd881c534e913c1ee7d991f4f9e6ab0f::nsn::NSN';
const DEEP_TYPE = '0x71afcf8eaeb282bad050ef78931205a15c9e49638f2a7c67bde2c372251e1c3e::deep::DEEP';
const DEEPBOOK_PKG = '0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134';
const CLOCK_ID = '0x6';
const BARAM_PKG = (import.meta.env.VITE_BARAM_PACKAGE_ID as string) ||
  '0xd3c73f768e2a089f9ebab92367cee472ddc02489f7feeb9496d824ceb4744070';
const BARAM_REGISTRY = (import.meta.env.VITE_BARAM_REGISTRY_ID as string) ||
  '0x509825058d4a537d3e9dfea39120077c02c1cf68f8b33969689017ae97c8e833';

interface PairInfo {
  pool: string;
  baseType: string;
  quoteType: string;
  baseDecimals: number;
  quoteDecimals: number;
}

const PAIRS: Record<TraderPair, PairInfo> = {
  NBTC_NUSDC: { pool: '0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0', baseType: NBTC_TYPE, quoteType: NUSDC_TYPE, baseDecimals: 8, quoteDecimals: 6 },
  NETH_NUSDC: { pool: '0xb6c960985711cf5a9cc5063cec8c7ad148794e4cb3c1ad1cea224911cd68e7b7', baseType: NETH_TYPE, quoteType: NUSDC_TYPE, baseDecimals: 8, quoteDecimals: 6 },
  NSOL_NUSDC: { pool: '0x577f81bb5dae12aac57103ed0231aae200af3ac1c5db3d523b679b09ac88c769', baseType: NSOL_TYPE, quoteType: NUSDC_TYPE, baseDecimals: 9, quoteDecimals: 6 },
  NSN_NUSDC:  { pool: '0x5953740daf54d767f2cd71a8372db75c7277f2907b55e0bdf7c172d96e033b1e', baseType: NSN_TYPE,  quoteType: NUSDC_TYPE, baseDecimals: 9, quoteDecimals: 6 },
};

// ===== Cycle types =====

export interface TradeRecord {
  ts: number;
  action: 'BUY' | 'SELL';
  sizeQuoteRaw: string;
  digest: string;
}

export interface CycleHooks {
  onLog?: (line: string) => void;
  onTrade?: (rec: TradeRecord) => void;
  /** Called when a new AER request is created on-chain */
  onRequest?: (requestId: number) => void;
}

export interface CycleResult {
  requestId?: number;
  decision?: { action: 'BUY' | 'SELL' | 'HOLD'; sizeNUSDC: number; reason: string };
  trade?: TradeRecord;
  error?: string;
}

// ===== Lightweight per-bot state in localStorage =====
function stateKey(agentAddress: string): string {
  return `baram:trader-state:${agentAddress.toLowerCase()}`;
}

interface TraderState {
  lastTradeDigest: string | null;
  trades: TradeRecord[];
}

export function loadState(agentAddress: string): TraderState {
  try {
    const raw = localStorage.getItem(stateKey(agentAddress));
    if (raw) {
      const p = JSON.parse(raw) as Partial<TraderState>;
      return {
        lastTradeDigest: typeof p.lastTradeDigest === 'string' ? p.lastTradeDigest : null,
        trades: Array.isArray(p.trades) ? p.trades.slice(-50) : [],
      };
    }
  } catch { /* corrupt */ }
  return { lastTradeDigest: null, trades: [] };
}

function saveState(agentAddress: string, s: TraderState): void {
  try {
    localStorage.setItem(stateKey(agentAddress), JSON.stringify({ ...s, trades: s.trades.slice(-50) }));
  } catch { /* quota */ }
}

function digestB58ToIdHex(d: string): string | null {
  try {
    const bytes = fromBase58(d);
    if (bytes.length !== 32) return null;
    return '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

function dailySpent(trades: TradeRecord[]): bigint {
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  return trades.filter((t) => t.ts >= dayAgo).reduce((acc, t) => acc + BigInt(t.sizeQuoteRaw), 0n);
}

// ===== Prompt =====
function buildPrompt(opts: {
  agentAddr: string;
  pair: TraderPair;
  baseRaw: bigint;
  quoteRaw: bigint;
  baseDecimals: number;
  quoteDecimals: number;
  perTradeMaxRaw: bigint;
  dailyMaxRaw: bigint;
  dailySpentRaw: bigint;
  recent: TradeRecord[];
  template: string | null;
}): string {
  const base = (Number(opts.baseRaw) / 10 ** opts.baseDecimals).toFixed(opts.baseDecimals);
  const quote = (Number(opts.quoteRaw) / 10 ** opts.quoteDecimals).toFixed(opts.quoteDecimals);
  const perCap = Number(opts.perTradeMaxRaw) / 1e6;
  const dailyCap = Number(opts.dailyMaxRaw) / 1e6;
  const remaining = Math.max(0, dailyCap - Number(opts.dailySpentRaw) / 1e6);
  const recent = opts.recent.slice(-3)
    .map((t) => `  - ${new Date(t.ts).toISOString()} ${t.action} ${(Number(BigInt(t.sizeQuoteRaw))/1e6).toFixed(4)} NUSDC eq (${t.digest.slice(0,8)})`)
    .join('\n') || '  (none)';

  if (opts.template && opts.template.trim().length > 0) {
    return opts.template
      .replaceAll('{{nbtc}}', base)
      .replaceAll('{{base}}', base)
      .replaceAll('{{nusdc}}', quote)
      .replaceAll('{{quote}}', quote)
      .replaceAll('{{pair}}', opts.pair)
      .replaceAll('{{perTradeCap}}', String(perCap))
      .replaceAll('{{dailyCap}}', String(dailyCap))
      .replaceAll('{{remaining}}', remaining.toFixed(4))
      .replaceAll('{{recent}}', recent);
  }

  return [
    `You are an autonomous DeFi trader on Pado DEX (Sui devnet, ${opts.pair.replace('_','/')}, DeepBook v3).`,
    `Time: ${new Date().toISOString()}`,
    `Wallet: ${opts.agentAddr}`,
    `Holdings: ${base} base, ${quote} quote (NUSDC)`,
    `Per-trade size cap: ${perCap} NUSDC equivalent`,
    `Daily cap: ${dailyCap} ; spent today: ${(Number(opts.dailySpentRaw)/1e6).toFixed(4)} ; remaining: ${remaining.toFixed(4)}`,
    `Recent trades:`,
    recent,
    ``,
    `Decide ONE action this cycle. Output STRICT JSON only (no commentary, no code fences):`,
    `{"action":"BUY"|"SELL"|"HOLD","sizeNUSDC":<number, 0 to ${perCap}>,"reason":"<one short sentence>"}`,
    `BUY swaps quote -> base. SELL swaps base -> quote. HOLD = skip.`,
    `If insufficient balance for the chosen action, return HOLD.`,
    `sizeNUSDC must not exceed remaining daily cap (${remaining.toFixed(4)}).`,
  ].join('\n');
}

function parseDecision(raw: string): { action: 'BUY' | 'SELL' | 'HOLD'; sizeNUSDC: number; reason: string } {
  const m = raw.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error(`No JSON in LLM response: ${raw.slice(0, 200)}`);
  const obj = JSON.parse(m[0]);
  if (!['BUY', 'SELL', 'HOLD'].includes(obj.action)) throw new Error(`Invalid action: ${obj.action}`);
  const sizeNUSDC = Number(obj.sizeNUSDC ?? 0);
  if (!Number.isFinite(sizeNUSDC) || sizeNUSDC < 0) throw new Error(`Invalid sizeNUSDC: ${obj.sizeNUSDC}`);
  return { action: obj.action, sizeNUSDC, reason: String(obj.reason ?? '').slice(0, 200) };
}

// ===== Baram on-chain request creation =====
async function createBaramRequest(
  client: SuiClient,
  keypair: Ed25519Keypair,
  budgetId: string,
  prompt: string,
  model: string,
  executorAddress: string,
  pricePerRequestRaw: bigint,
  category: string,
): Promise<{ requestId: number }> {
  const promptHash = sha256(new TextEncoder().encode(prompt));
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM_PKG}::baram::create_request_with_budget_v2`,
    arguments: [
      tx.object(BARAM_REGISTRY),
      tx.object(budgetId),
      tx.pure.vector('u8', Array.from(promptHash)),
      tx.pure.string(model),
      tx.pure.address(executorAddress),
      tx.pure.u64(pricePerRequestRaw),
      tx.pure.string(category),
      tx.object(CLOCK_ID),
    ],
  });
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEvents: true },
  });
  await client.waitForTransaction({ digest: result.digest });
  const ev = result.events?.find((e) => e.type.includes('RequestCreated'));
  if (!ev) throw new Error('RequestCreated event missing');
  const raw = (ev.parsedJson as Record<string, unknown>).request_id;
  const requestId = Number(raw);
  if (!Number.isFinite(requestId)) throw new Error(`Invalid request_id: ${raw}`);
  return { requestId };
}

// ===== Executor /execute call =====
async function callExecuteEndpoint(opts: {
  endpoint: string;
  apiKey: string;
  requestId: number;
  prompt: string;
  model: string;
  extras?: { purpose?: string | null; triggeredBy?: string | null };
}): Promise<{ result: string }> {
  const body: Record<string, unknown> = {
    requestId: opts.requestId,
    encryptedPrompt: btoa(opts.prompt),
    model: opts.model,
  };
  if (opts.extras?.purpose) body.purpose = opts.extras.purpose;
  if (opts.extras?.triggeredBy) body.triggeredBy = opts.extras.triggeredBy;

  const res = await fetch(`${opts.endpoint}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': opts.apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Executor /execute ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json() as Record<string, unknown>;
  return { result: String(data.result ?? '') };
}

// ===== DeepBook swap =====
async function executeTrade(
  client: SuiClient,
  keypair: Ed25519Keypair,
  pair: PairInfo,
  decision: { action: 'BUY' | 'SELL' | 'HOLD'; sizeNUSDC: number; reason: string },
  balances: { baseRaw: bigint; quoteRaw: bigint },
  perTradeMaxQuoteRaw: bigint,
): Promise<TradeRecord | null> {
  if (decision.action === 'HOLD') return null;
  const sizeQuoteRaw = BigInt(Math.floor(decision.sizeNUSDC * 1e6));
  if (sizeQuoteRaw <= 0n) return null;
  if (sizeQuoteRaw > perTradeMaxQuoteRaw) {
    throw new Error(`Trade size > per-trade cap`);
  }

  const sender = keypair.toSuiAddress();
  const tx = new Transaction();
  const [zeroDeep] = tx.moveCall({ target: '0x2::coin::zero', typeArguments: [DEEP_TYPE] }) as unknown as [TransactionObjectArgument];

  if (decision.action === 'BUY') {
    if (balances.quoteRaw < sizeQuoteRaw) throw new Error('Insufficient quote balance');
    const coins = await client.getCoins({ owner: sender, coinType: pair.quoteType, limit: 50 });
    if (coins.data.length === 0) throw new Error('No quote coin owned');
    const primary = coins.data[0].coinObjectId;
    if (coins.data.length > 1) {
      tx.mergeCoins(tx.object(primary), coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
    }
    const [quoteCoin] = tx.splitCoins(tx.object(primary), [tx.pure.u64(sizeQuoteRaw)]);
    const [baseOut, quoteOut, deepOut] = tx.moveCall({
      target: `${DEEPBOOK_PKG}::pool::swap_exact_quote_for_base`,
      typeArguments: [pair.baseType, pair.quoteType],
      arguments: [tx.object(pair.pool), quoteCoin, zeroDeep, tx.pure.u64(0n), tx.object(CLOCK_ID)],
    }) as unknown as [TransactionObjectArgument, TransactionObjectArgument, TransactionObjectArgument];
    tx.transferObjects([baseOut, quoteOut, deepOut], tx.pure.address(sender));
  } else {
    // TODO(slippage): SELL uses approximated fraction + min_quote_out=0.
    // On thin devnet pools per-trade NUSDC cap does not bound NBTC outflow.
    // Fix: read pool mid via get_quote_quantity_out and pass non-zero min.
    if (balances.baseRaw <= 0n) throw new Error('SELL: zero base balance');
    const fraction = Number(sizeQuoteRaw) / Number(perTradeMaxQuoteRaw);
    const sizeBaseRaw = BigInt(Math.floor(Number(balances.baseRaw) * Math.max(fraction, 0.0001)));
    if (sizeBaseRaw <= 0n) throw new Error('SELL: computed base size 0');
    const coins = await client.getCoins({ owner: sender, coinType: pair.baseType, limit: 50 });
    if (coins.data.length === 0) throw new Error('No base coin owned');
    const primary = coins.data[0].coinObjectId;
    if (coins.data.length > 1) {
      tx.mergeCoins(tx.object(primary), coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
    }
    const [baseCoin] = tx.splitCoins(tx.object(primary), [tx.pure.u64(sizeBaseRaw)]);
    const [baseOut, quoteOut, deepOut] = tx.moveCall({
      target: `${DEEPBOOK_PKG}::pool::swap_exact_base_for_quote`,
      typeArguments: [pair.baseType, pair.quoteType],
      arguments: [tx.object(pair.pool), baseCoin, zeroDeep, tx.pure.u64(0n), tx.object(CLOCK_ID)],
    }) as unknown as [TransactionObjectArgument, TransactionObjectArgument, TransactionObjectArgument];
    tx.transferObjects([baseOut, quoteOut, deepOut], tx.pure.address(sender));
  }

  const r = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: r.digest });
  if (r.effects?.status.status !== 'success') {
    throw new Error(`Trade PTB failed: ${JSON.stringify(r.effects?.status)}`);
  }
  return { ts: Date.now(), action: decision.action, sizeQuoteRaw: sizeQuoteRaw.toString(), digest: r.digest };
}

// ===== Public entry =====
export interface RunCycleArgs {
  client: SuiClient;
  keypair: Ed25519Keypair;
  config: TraderConfig;
  /** AER price per request, NUSDC raw (default 1_000_000 = 1 NUSDC) */
  pricePerRequestRaw?: bigint;
  hooks?: CycleHooks;
}

export async function runOneCycle(args: RunCycleArgs): Promise<CycleResult> {
  const { client, keypair, config, hooks } = args;
  const pricePerRequestRaw = args.pricePerRequestRaw ?? 1_000_000n;
  const log = (m: string) => hooks?.onLog?.(m);
  const pair = PAIRS[config.pair];
  if (!pair) return { error: `Unknown pair: ${config.pair}` };

  const state = loadState(config.agentAddress);
  log(`Cycle start; lastTrade=${state.lastTradeDigest ?? 'none'}`);

  // 1. Fetch balances
  const [base, quote] = await Promise.all([
    client.getBalance({ owner: config.agentAddress, coinType: pair.baseType }),
    client.getBalance({ owner: config.agentAddress, coinType: pair.quoteType }),
  ]);
  const baseRaw = BigInt(base.totalBalance);
  const quoteRaw = BigInt(quote.totalBalance);
  log(`Balances: base=${baseRaw} quote=${quoteRaw}`);

  // 2. Build prompt
  const prompt = buildPrompt({
    agentAddr: config.agentAddress,
    pair: config.pair,
    baseRaw,
    quoteRaw,
    baseDecimals: pair.baseDecimals,
    quoteDecimals: pair.quoteDecimals,
    perTradeMaxRaw: BigInt(config.perTradeMaxQuoteRaw),
    dailyMaxRaw: BigInt(config.dailyMaxQuoteRaw),
    dailySpentRaw: dailySpent(state.trades),
    recent: state.trades,
    template: config.promptTemplate,
  });

  // 3. Create on-chain Baram request
  let requestId: number;
  try {
    const r = await createBaramRequest(client, keypair, config.budgetId, prompt, config.model, config.executorAddress, pricePerRequestRaw, 'ai_inference');
    requestId = r.requestId;
    hooks?.onRequest?.(requestId);
    log(`On-chain requestId=${requestId}`);
  } catch (err) {
    return { error: `create_request failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // 4. Call executor /execute (LLM + AER auto-issued, with prior-trade link)
  const extras = state.lastTradeDigest
    ? { purpose: `Trader cycle following trade ${state.lastTradeDigest}`, triggeredBy: digestB58ToIdHex(state.lastTradeDigest) }
    : undefined;

  let llmResult: string;
  try {
    const r = await callExecuteEndpoint({
      endpoint: config.executorEndpoint,
      apiKey: 'browser-no-auth', // self-hosted local executor doesn't verify
      requestId,
      prompt,
      model: config.model,
      extras,
    });
    llmResult = r.result;
    log(`LLM result (${llmResult.length} chars)`);
  } catch (err) {
    return { requestId, error: `executor call failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // 5. Parse decision
  let decision;
  try {
    decision = parseDecision(llmResult);
  } catch (err) {
    return { requestId, error: `decision parse: ${err instanceof Error ? err.message : String(err)}` };
  }
  log(`Decision: ${decision.action} ${decision.sizeNUSDC} NUSDC ("${decision.reason}")`);

  if (decision.action === 'HOLD') return { requestId, decision };

  // 6. Execute trade
  let trade: TradeRecord | null = null;
  try {
    trade = await executeTrade(
      client,
      keypair,
      pair,
      decision,
      { baseRaw, quoteRaw },
      BigInt(config.perTradeMaxQuoteRaw),
    );
  } catch (err) {
    return { requestId, decision, error: `trade: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!trade) return { requestId, decision };

  // 7. Persist state
  const next: TraderState = {
    lastTradeDigest: trade.digest,
    trades: [...state.trades, trade].slice(-50),
  };
  saveState(config.agentAddress, next);
  hooks?.onTrade?.(trade);
  log(`Trade: ${trade.action} ${(Number(BigInt(trade.sizeQuoteRaw))/1e6).toFixed(4)} NUSDC eq ${trade.digest.slice(0,8)}..`);
  return { requestId, decision, trade };
}
