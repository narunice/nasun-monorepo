/**
 * Probe whether the registered Pado pool is DEEP-whitelisted (S14 gating).
 *
 * The C3-v2 PTB (DV9 Cmd 1+5) assumes `coin::zero<DEEP>` is accepted as
 * the fee input and that the swap returns zero leftover DEEP — i.e. the
 * pool is on Pado's DEEP whitelist. If that assumption ever fails, every
 * execution AER would abort at Cmd 5 (`destroy_zero` on a non-zero
 * Coin<DEEP>) and roll back the entire PTB.
 *
 * This script must be run FIRST before any S* smoke step, against the
 * actual Pado pool the action-classes.json registry points at:
 *
 *   1. Read `pool::whitelisted<Base, Quote>(self)` → bool
 *   2. Dry-run a tiny swap via `pool::get_quantity_out` and inspect the
 *      `deep_required` u64 (3rd tuple element). For a DEEP-whitelisted
 *      pool this is 0.
 *
 * If either check fails, the smoke run must STOP. Recovery is a phase-2
 * contract change (deposit_swap_leftover<DEEP> + add DEEP to
 * cap.allowed_assets).
 *
 * Usage (from monorepo root):
 *   pnpm --filter baram-scripts exec tsx --env-file=../executor-nitro/.env \
 *     probe-deep-fee.ts
 *
 * Or with explicit env:
 *   PADO_DEEPBOOK_PACKAGE_ID=0x... PADO_NBTC_NUSDC_POOL=0x... \
 *   NBTC_TYPE=0x...::nbtc::NBTC NUSDC_TYPE=0x...::nusdc::NUSDC \
 *   npx tsx apps/baram/scripts/probe-deep-fee.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

const RPC_URL = process.env.SUI_RPC_URL ?? 'https://rpc.devnet.nasun.io';
const PADO_PKG = required('PADO_DEEPBOOK_PACKAGE_ID');
const POOL = required('PADO_NBTC_NUSDC_POOL');
const BASE = required('NBTC_TYPE');
const QUOTE = required('NUSDC_TYPE');
const PROBE_SIZE_QUOTE = 1_000_000n; // 1 NUSDC raw (6 decimals)
const DUMMY_SENDER = '0x' + '00'.repeat(32);

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`[probe-deep-fee] FATAL: env "${key}" is unset.`);
    process.exit(1);
  }
  return v;
}

function decodeU64LE(bytes: number[]): bigint {
  if (bytes.length !== 8) throw new Error(`expected 8 bytes, got ${bytes.length}`);
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(bytes[i]) << BigInt(i * 8);
  return v;
}

async function main(): Promise<void> {
  const client = new SuiClient({ url: RPC_URL });

  console.log(`[probe-deep-fee] RPC=${RPC_URL}`);
  console.log(`[probe-deep-fee] pool=${POOL}`);
  console.log(`[probe-deep-fee] types: base=${BASE} quote=${QUOTE}`);

  // Check 1: pool::whitelisted<Base, Quote>(self) → bool
  const tx1 = new Transaction();
  tx1.moveCall({
    target: `${PADO_PKG}::pool::whitelisted`,
    typeArguments: [BASE, QUOTE],
    arguments: [tx1.object(POOL)],
  });
  const r1 = await client.devInspectTransactionBlock({
    sender: DUMMY_SENDER,
    transactionBlock: tx1,
  });
  if (r1.effects?.status?.status !== 'success') {
    console.error(`[probe-deep-fee] Check 1 (whitelisted) failed: ${r1.effects?.status?.error}`);
    process.exit(2);
  }
  const whitelistedBytes = r1.results?.[0]?.returnValues?.[0]?.[0];
  if (!whitelistedBytes || whitelistedBytes.length !== 1) {
    console.error('[probe-deep-fee] Check 1: malformed return — expected 1-byte bool');
    process.exit(2);
  }
  const isWhitelisted = whitelistedBytes[0] === 1;
  console.log(`[probe-deep-fee] Check 1: pool whitelisted = ${isWhitelisted}`);

  // Check 2: dry-run a probe swap; deep_required should be 0.
  const tx2 = new Transaction();
  tx2.moveCall({
    target: `${PADO_PKG}::pool::get_quantity_out`,
    typeArguments: [BASE, QUOTE],
    arguments: [
      tx2.object(POOL),
      tx2.pure.u64(0n),                  // base_quantity (BUY: 0)
      tx2.pure.u64(PROBE_SIZE_QUOTE),    // quote_quantity (BUY: size)
      tx2.object('0x6'),                  // Clock
    ],
  });
  const r2 = await client.devInspectTransactionBlock({
    sender: DUMMY_SENDER,
    transactionBlock: tx2,
  });
  if (r2.effects?.status?.status !== 'success') {
    console.error(`[probe-deep-fee] Check 2 (get_quantity_out) failed: ${r2.effects?.status?.error}`);
    process.exit(2);
  }
  const returnValues = r2.results?.[0]?.returnValues ?? [];
  if (returnValues.length < 3) {
    console.error(`[probe-deep-fee] Check 2: expected 3 returns, got ${returnValues.length}`);
    process.exit(2);
  }
  const baseOut = decodeU64LE(returnValues[0][0]);
  const quoteOut = decodeU64LE(returnValues[1][0]);
  const deepRequired = decodeU64LE(returnValues[2][0]);
  console.log(
    `[probe-deep-fee] Check 2: get_quantity_out(0, ${PROBE_SIZE_QUOTE}, clock) → ` +
      `(base=${baseOut}, quote=${quoteOut}, deep_required=${deepRequired})`,
  );

  // Verdict
  const ok = isWhitelisted && deepRequired === 0n;
  if (!ok) {
    console.error('');
    console.error('[probe-deep-fee] VERDICT: NOT SAFE for C3-v2 PTB.');
    console.error('  - whitelisted must be true (got', isWhitelisted + ')');
    console.error('  - deep_required must be 0 (got', deepRequired.toString() + ')');
    console.error('  - Cmd 1 must accept coin::zero<DEEP>; Cmd 5 must destroy zero leftover.');
    console.error('  - STOP smoke run. Phase-2 fix: switch to deposit_swap_leftover<DEEP>.');
    process.exit(3);
  }
  console.log('');
  console.log('[probe-deep-fee] VERDICT: pool is DEEP-whitelisted with zero fee.');
  console.log('[probe-deep-fee] Safe to proceed with C3-v2 smoke S1–S15.');
}

main().catch((err) => {
  console.error('[probe-deep-fee] Unexpected error:', err);
  process.exit(1);
});
