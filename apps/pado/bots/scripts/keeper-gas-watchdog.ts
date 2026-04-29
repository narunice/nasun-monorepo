/**
 * Keeper Gas Watchdog
 *
 * Treasury-pattern auto-refill for keeper wallets across the stack
 * (LP bots, price-updater, tpsl-keeper, lottery-keepers, crash operator).
 *
 * Source wallet (KEEPER_GAS_SOURCE_PRIVKEY, fallback LP_PRIVATE_KEY_SOURCE)
 * holds a large NASUN balance. Each interval, the watchdog queries every
 * configured target address; targets below THRESHOLD are topped up to
 * TARGET in a single PTB. Faucet rate limits are bypassed entirely since
 * we transfer from a self-funded wallet.
 *
 * Env:
 *   KEEPER_GAS_SOURCE_PRIVKEY     source wallet privkey (suiprivkey1...)
 *   LP_PRIVATE_KEY_SOURCE         fallback source privkey
 *   KEEPER_GAS_TARGETS            comma-separated `label:0xaddr` pairs
 *   KEEPER_GAS_THRESHOLD          refill below this balance (NASUN, default 1000)
 *   KEEPER_GAS_TARGET             refill up to this balance  (NASUN, default 100000)
 *   KEEPER_GAS_INTERVAL_MS        check interval (default 3600000 = 1h)
 *   KEEPER_GAS_SOURCE_WARN        warn when source < this (NASUN, default 200000)
 *   NASUN_RPC_URL                 default https://rpc.devnet.nasun.io
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const INTERVAL_MS = parseInt(process.env.KEEPER_GAS_INTERVAL_MS || '3600000', 10);
const THRESHOLD = parseFloat(process.env.KEEPER_GAS_THRESHOLD || '1000');
const TARGET = parseFloat(process.env.KEEPER_GAS_TARGET || '100000');
const SOURCE_WARN = parseFloat(process.env.KEEPER_GAS_SOURCE_WARN || '200000');

if (TARGET <= THRESHOLD) {
  console.error('FATAL: KEEPER_GAS_TARGET must exceed KEEPER_GAS_THRESHOLD');
  process.exit(1);
}

interface Target {
  label: string;
  address: string;
}

function parseTargets(raw: string | undefined): Target[] {
  if (!raw) return [];
  const out: Target[] = [];
  for (const piece of raw.split(',')) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const [label, address] = trimmed.split(':').map((s) => s.trim());
    if (!label || !/^0x[0-9a-fA-F]{64}$/.test(address ?? '')) {
      console.error(`Skipping malformed target entry: "${trimmed}"`);
      continue;
    }
    out.push({ label, address: address.toLowerCase() });
  }
  return out;
}

function loadSourceKeypair(): Ed25519Keypair {
  const raw = process.env.KEEPER_GAS_SOURCE_PRIVKEY || process.env.LP_PRIVATE_KEY_SOURCE;
  if (!raw) throw new Error('KEEPER_GAS_SOURCE_PRIVKEY (or LP_PRIVATE_KEY_SOURCE) not set');
  const { secretKey } = decodeSuiPrivateKey(raw);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

function ts(): string {
  return new Date().toLocaleString('en-US', { hour12: false });
}

async function getNasun(client: SuiClient, owner: string): Promise<number> {
  const b = await client.getBalance({ owner });
  return Number(b.totalBalance) / 1e9;
}

async function refillBatch(
  client: SuiClient,
  source: Ed25519Keypair,
  needs: Array<{ target: Target; current: number }>,
): Promise<void> {
  const tx = new Transaction();
  // Single PTB: split N coins from gas, transfer each to its recipient.
  const amounts = needs.map(({ current }) => BigInt(Math.round((TARGET - current) * 1e9)));
  const coins = tx.splitCoins(tx.gas, amounts);
  for (let i = 0; i < needs.length; i++) {
    tx.transferObjects([coins[i]], needs[i].target.address);
  }
  // 5M base + 3M per recipient is conservative; PTB transfers are cheap.
  tx.setGasBudget(5_000_000 + needs.length * 3_000_000);

  const res = await client.signAndExecuteTransaction({
    signer: source,
    transaction: tx,
    options: { showEffects: true },
  });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`refill PTB failed: ${res.effects?.status?.error}`);
  }
  await client.waitForTransaction({ digest: res.digest });
  console.log(
    `[${ts()}] refilled ${needs.length} wallet(s) digest=${res.digest.slice(0, 12)}.. ` +
      needs.map((n) => `${n.target.label}=+${(TARGET - n.current).toFixed(0)}`).join(' '),
  );
}

async function tick(client: SuiClient, source: Ed25519Keypair, sourceAddr: string, targets: Target[]): Promise<void> {
  const sourceBal = await getNasun(client, sourceAddr);
  if (sourceBal < SOURCE_WARN) {
    console.warn(
      `[${ts()}] SOURCE LOW: ${sourceBal.toFixed(0)} NASUN < ${SOURCE_WARN} (addr=${sourceAddr.slice(0, 12)}..). ` +
        `Top up the source wallet manually.`,
    );
  }

  const balances = await Promise.all(targets.map((t) => getNasun(client, t.address).catch(() => -1)));
  const needs: Array<{ target: Target; current: number }> = [];
  const lines: string[] = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const bal = balances[i];
    if (bal < 0) {
      lines.push(`${t.label} ERR`);
      continue;
    }
    if (bal < THRESHOLD) {
      needs.push({ target: t, current: bal });
      lines.push(`${t.label} LOW(${bal.toFixed(0)})`);
    } else {
      lines.push(`${t.label} OK(${bal.toFixed(0)})`);
    }
  }
  console.log(`[${ts()}] source=${sourceBal.toFixed(0)} | ${lines.join(' ')}`);

  if (needs.length === 0) return;

  // Defensive: ensure source has enough for the batch + buffer.
  const totalNeeded = needs.reduce((s, n) => s + (TARGET - n.current), 0);
  if (sourceBal < totalNeeded + 1) {
    console.error(
      `[${ts()}] SOURCE INSUFFICIENT: need ${totalNeeded.toFixed(0)} + 1 NASUN, have ${sourceBal.toFixed(0)}. Skipping refill.`,
    );
    return;
  }

  try {
    await refillBatch(client, source, needs);
  } catch (err) {
    console.error(`[${ts()}] refill failed:`, err instanceof Error ? err.message : err);
  }
}

async function main(): Promise<void> {
  const targets = parseTargets(process.env.KEEPER_GAS_TARGETS);
  if (targets.length === 0) {
    console.error('FATAL: KEEPER_GAS_TARGETS is empty. Format: "label1:0xaddr,label2:0xaddr"');
    process.exit(1);
  }

  const source = loadSourceKeypair();
  const sourceAddr = source.getPublicKey().toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  console.log('=== Keeper Gas Watchdog ===');
  console.log(`RPC:        ${RPC_URL}`);
  console.log(`Source:     ${sourceAddr}`);
  console.log(`Threshold:  ${THRESHOLD} NASUN`);
  console.log(`Target:     ${TARGET} NASUN`);
  console.log(`Interval:   ${INTERVAL_MS / 1000}s`);
  console.log(`Targets:    ${targets.map((t) => `${t.label}=${t.address.slice(0, 10)}..`).join(', ')}`);
  console.log('');

  await tick(client, source, sourceAddr, targets);

  const schedule = (): void => {
    setTimeout(async () => {
      try {
        await tick(client, source, sourceAddr, targets);
      } catch (err) {
        console.error(`[${ts()}] tick error:`, err instanceof Error ? err.message : err);
      } finally {
        schedule();
      }
    }, INTERVAL_MS);
  };
  schedule();
}

main().catch((err) => {
  console.error('keeper-gas-watchdog fatal:', err);
  process.exit(1);
});
