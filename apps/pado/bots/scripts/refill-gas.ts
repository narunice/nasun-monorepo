/**
 * Manual Gas Refill Script
 *
 * Transfers NASUN gas from a source wallet to each LP bot wallet in a single PTB TX.
 * Run this when health-check reports bot gas below threshold (< 5,000 NASUN).
 *
 * Usage:
 *   LP_PRIVATE_KEY_SOURCE=<suiprivkey1...> pnpm tsx scripts/refill-gas.ts [--amount 100000]
 *
 * Requires:
 *   LP_PRIVATE_KEY_SOURCE         - source wallet with sufficient NASUN
 *   LP_PRIVATE_KEY_NBTC/NETH/NSOL - bot wallet addresses (keys loaded for address only)
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';

function parseArgs(): { amount: number } {
  const args = process.argv.slice(2);
  let amount = 100_000;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--amount' && args[i + 1]) amount = parseFloat(args[++i]);
  }
  if (amount <= 0 || !isFinite(amount)) {
    console.error('Invalid --amount value');
    process.exit(1);
  }
  return { amount };
}

function loadKeypair(envKey: string): Ed25519Keypair {
  const keyStr = process.env[envKey];
  if (!keyStr) throw new Error(`${envKey} not set`);
  try {
    const { secretKey } = decodeSuiPrivateKey(keyStr);
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch {
    return Ed25519Keypair.fromSecretKey(Buffer.from(keyStr, 'hex'));
  }
}

function loadKeypairSafe(envKey: string): Ed25519Keypair | null {
  try { return loadKeypair(envKey); } catch { return null; }
}

async function getGasBalance(client: SuiClient, owner: string): Promise<number> {
  const balance = await client.getBalance({ owner });
  return Number(balance.totalBalance) / 1e9;
}

async function main() {
  const { amount } = parseArgs();

  const sourceKeypair = loadKeypair('LP_PRIVATE_KEY_SOURCE');
  const sourceAddr = sourceKeypair.getPublicKey().toSuiAddress();

  // Load bot keypairs (address only needed)
  const botWallets = (['NBTC', 'NETH', 'NSOL'] as const).map((market) => {
    const kp = loadKeypairSafe(`LP_PRIVATE_KEY_${market}`) ?? loadKeypairSafe('LP_PRIVATE_KEY');
    if (!kp) { console.error(`LP_PRIVATE_KEY_${market} not set`); process.exit(1); }
    return { market, address: kp.getPublicKey().toSuiAddress() };
  });

  const client = new SuiClient({ url: RPC_URL });

  // Print current balances
  const sourceGas = await getGasBalance(client, sourceAddr);
  console.log(`Source wallet: ${sourceAddr}`);
  console.log(`  Gas: ${sourceGas.toLocaleString()} NASUN`);
  console.log('');

  const totalNeeded = amount * botWallets.length;
  if (sourceGas < totalNeeded + 1) {
    console.error(`Insufficient source balance. Need ${totalNeeded.toLocaleString()} NASUN + fees, have ${sourceGas.toLocaleString()}`);
    process.exit(1);
  }

  console.log('Bot wallets (before):');
  for (const { market, address } of botWallets) {
    const gas = await getGasBalance(client, address);
    console.log(`  ${market}: ${address.slice(0, 12)}... = ${gas.toLocaleString()} NASUN`);
  }
  console.log('');

  // Build single PTB: split 3 coins at once, transfer each to corresponding bot wallet
  const amountMist = BigInt(Math.round(amount * 1e9));
  const tx = new Transaction();
  const [coinNbtc, coinNeth, coinNsol] = tx.splitCoins(tx.gas, [amountMist, amountMist, amountMist]);
  tx.transferObjects([coinNbtc], botWallets[0].address);
  tx.transferObjects([coinNeth], botWallets[1].address);
  tx.transferObjects([coinNsol], botWallets[2].address);
  tx.setGasBudget(20_000_000);

  console.log(`Transferring ${amount.toLocaleString()} NASUN to each bot wallet...`);
  const result = await client.signAndExecuteTransaction({
    signer: sourceKeypair,
    transaction: tx,
    options: { showEffects: true },
  });

  if (result.effects?.status?.status !== 'success') {
    console.error('TX failed:', result.effects?.status?.error);
    process.exit(1);
  }

  console.log(`TX success: ${result.digest}`);
  await client.waitForTransaction({ digest: result.digest });

  // Print updated balances
  console.log('');
  console.log('Bot wallets (after):');
  for (const { market, address } of botWallets) {
    const gas = await getGasBalance(client, address);
    console.log(`  ${market}: ${address.slice(0, 12)}... = ${gas.toLocaleString()} NASUN`);
  }
}

main().catch((err) => {
  console.error('refill-gas failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
