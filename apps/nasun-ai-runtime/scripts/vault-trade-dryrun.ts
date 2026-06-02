/**
 * Standalone verifier for the vault execute_trade path. Reads a live vault,
 * fetches its cap version, quotes the live pool reference price, then
 * devInspect-simulates execute_trade for the AUTO decision plus forced
 * BUY/SELL legs. No keypair, no gas, no signing -- pure simulation, so it
 * never touches the contended publisher gas coin.
 *
 *   pnpm --filter @nasun/nasun-ai-runtime exec tsx scripts/vault-trade-dryrun.ts
 *
 * Env (all optional): VAULT_ID (default = demo vault), RPC_URL,
 * VAULT_BAND_BPS, VAULT_MAX_SLIPPAGE_BPS, VAULT_STEP_QTY_RAW,
 * VAULT_ALLOW_SELL. When LLM_API_URL + LLM_API_KEY (+ optional LLM_MODEL)
 * are set, it ALSO runs the live LLM decision seam (decideVaultTradeLLM)
 * against the same inputs so an operator can preview the model's direction
 * before going live -- still no signing.
 */

import { SuiClient } from '@mysten/sui/client';

import { fetchCapabilityFields } from '../src/presets/trader-cycle.js';
import {
  readVaultState,
  quoteReferenceRaw,
  decideVaultTrade,
  decideVaultTradeLLM,
  computeOrderParams,
  buildExecuteTradeTx,
  dryRunVaultTrade,
} from '../src/presets/vault-trade.js';

const RPC = process.env.RPC_URL ?? 'https://rpc.devnet.nasun.io';
const VAULT_ID =
  process.env.VAULT_ID ??
  '0xf79c772583aa11c4ca9e1314e66eb5e16961f85f608e4bdc952f66817b03acb6';
const BAND_BPS = Number(process.env.VAULT_BAND_BPS ?? 50);
const SLIPPAGE_BPS = Number(process.env.VAULT_MAX_SLIPPAGE_BPS ?? 100);
const STEP_QTY_RAW = BigInt(process.env.VAULT_STEP_QTY_RAW ?? '1000');
const ALLOW_SELL = process.env.VAULT_ALLOW_SELL === 'true';
const EXPIRY_MS = 120_000;

async function main(): Promise<void> {
  const client = new SuiClient({ url: RPC });
  const state = await readVaultState(client, VAULT_ID);
  const [{ version }, refPriceRaw] = await Promise.all([
    fetchCapabilityFields(client, state.capabilityId),
    quoteReferenceRaw(client),
  ]);

  console.log(`vault   ${VAULT_ID}`);
  console.log(`  agent=${state.agentAddress}`);
  console.log(`  manager=${state.managerAddress}`);
  console.log(`  cap=${state.capabilityId} version=${version}`);
  console.log(`  pool=${state.poolId}`);
  console.log(
    `  isKilled=${state.isKilled} lastMark=${state.lastMarkRaw} ref=${refPriceRaw} ` +
      `(~$${(Number(refPriceRaw) / 1e7).toFixed(2)})`,
  );

  const decideInput = {
    isKilled: state.isKilled,
    lastMarkRaw: state.lastMarkRaw,
    refPriceRaw,
    bandBps: BAND_BPS,
    allowSell: ALLOW_SELL,
  };
  const auto = decideVaultTrade(decideInput);
  console.log(`  BAND decision: ${auto.action} (${auto.deviationBps}bps) -- ${auto.reason}`);

  // Live LLM seam preview when creds are present. No signing; just shows what
  // the model would choose for these inputs (with its deterministic fallback).
  const llmApiUrl = process.env.LLM_API_URL ?? '';
  const llmApiKey = process.env.LLM_API_KEY ?? '';
  if (llmApiUrl !== '' && llmApiKey !== '') {
    const llm = await decideVaultTradeLLM(
      decideInput,
      { apiUrl: llmApiUrl, apiKey: llmApiKey, model: process.env.LLM_MODEL ?? 'llama-3.3-70b-versatile' },
      { log: (m) => console.log(`  ${m}`) },
    );
    console.log(`  LLM decision:  ${llm.action} (${llm.deviationBps}bps) -- ${llm.reason}`);
  } else {
    console.log('  LLM decision:  (skipped -- set LLM_API_URL + LLM_API_KEY to preview)');
  }

  // Force both legs so each direction's on-chain gates are exercised even
  // when the band says HOLD. A SELL may legitimately abort if the vault is
  // light on NBTC -- that still proves the PTB reaches DeepBook.
  for (const action of ['BUY', 'SELL'] as const) {
    const o = computeOrderParams({ action, refPriceRaw, slippageBps: SLIPPAGE_BPS, stepQtyRaw: STEP_QTY_RAW });
    const tx = buildExecuteTradeTx({
      vaultId: VAULT_ID,
      capabilityId: state.capabilityId,
      poolId: state.poolId,
      expectedCapVersion: BigInt(version),
      isBid: o.isBid,
      priceRaw: o.priceRaw,
      qtyRaw: o.qtyRaw,
      expireTsMs: BigInt(Date.now() + EXPIRY_MS),
    });
    const res = await dryRunVaultTrade(client, state.agentAddress, tx);
    console.log(
      `  [${action}] price=${o.priceRaw} qty=${o.qtyRaw} notional=${o.notionalRaw} -> ` +
        (res.ok ? `OK ${JSON.stringify(res.event ?? {})}` : `ABORT ${res.error}`),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
