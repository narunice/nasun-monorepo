/**
 * Refill the prediction-lp wallet with NUSDC from the devnet token faucet.
 *
 * Calls `<TOKENS_PACKAGE>::faucet::request_nusdc(faucet_object)` in a
 * single PTB with N moveCalls. Each call mints a fixed amount of NUSDC to
 * the sender. Loops the PTB until the wallet balance reaches TARGET_NUSDC.
 *
 * Env:
 *   PREDICTION_LP_PRIVATE_KEY     LP wallet privkey (suiprivkey1...)
 *   TARGET_NUSDC                  desired wallet balance (default 100000)
 *   ROUNDS_PER_PTB                request_nusdc calls per PTB (default 100)
 *   NASUN_RPC_URL                 default devnet
 *
 * Usage:
 *   node --env-file=apps/pado/bots/.env --import tsx \
 *     apps/pado/bots/scripts/refill-lp-nusdc.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
// undici IPv4 dispatcher removed: not installed on prod (pnpm install --prod).
// Mirrors commit 2c642ce2's batch-creator fix.
import { TOKENS_PACKAGE } from '../lib/config.js';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const TOKEN_FAUCET = '0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92';
const NUSDC_TYPE = `${TOKENS_PACKAGE}::nusdc::NUSDC`;
const NUSDC_DECIMALS = 6;

const TARGET_NUSDC = Number(process.env.TARGET_NUSDC || 100_000);
const ROUNDS_PER_PTB = Number(process.env.ROUNDS_PER_PTB || 100);
const MAX_PTBS = 20;

function parseKeypair(s: string): Ed25519Keypair {
  if (s.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(s);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  const clean = s.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error('bad privkey');
  return Ed25519Keypair.fromSecretKey(Buffer.from(clean, 'hex'));
}

async function balance(client: SuiClient, owner: string): Promise<number> {
  const b = await client.getBalance({ owner, coinType: NUSDC_TYPE });
  return Number(b.totalBalance) / 10 ** NUSDC_DECIMALS;
}

async function refillRound(client: SuiClient, kp: Ed25519Keypair): Promise<void> {
  const tx = new Transaction();
  tx.setGasBudget(2_000_000_000);
  for (let i = 0; i < ROUNDS_PER_PTB; i++) {
    tx.moveCall({
      target: `${TOKENS_PACKAGE}::faucet::request_nusdc`,
      arguments: [tx.object(TOKEN_FAUCET)],
    });
  }
  const r = await client.signAndExecuteTransaction({
    signer: kp, transaction: tx,
    options: { showEffects: true },
  });
  if (r.effects?.status?.status !== 'success') {
    throw new Error(`refill PTB failed: ${r.effects?.status?.error ?? '?'}`);
  }
  await client.waitForTransaction({ digest: r.digest });
}

async function main(): Promise<void> {
  const keyInput = process.env.PREDICTION_LP_PRIVATE_KEY;
  if (!keyInput) { console.error('PREDICTION_LP_PRIVATE_KEY required'); process.exit(1); }
  const kp = parseKeypair(keyInput);
  const addr = kp.toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  let bal = await balance(client, addr);
  console.log(`LP wallet ${addr}`);
  console.log(`  current NUSDC: ${bal.toFixed(2)}`);
  console.log(`  target:        ${TARGET_NUSDC}`);

  let i = 0;
  while (bal < TARGET_NUSDC && i < MAX_PTBS) {
    process.stdout.write(`  round ${i + 1}/${MAX_PTBS}... `);
    try {
      await refillRound(client, kp);
      const next = await balance(client, addr);
      console.log(`bal ${bal.toFixed(2)} -> ${next.toFixed(2)} (+${(next - bal).toFixed(2)})`);
      bal = next;
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    i++;
  }
  console.log(`Final: ${bal.toFixed(2)} NUSDC`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
