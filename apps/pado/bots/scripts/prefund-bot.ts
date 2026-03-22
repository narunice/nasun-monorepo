/**
 * Pre-fund Bot Script
 *
 * Mints tokens to a bot address using PTB batching of legacy faucet functions.
 * Legacy faucet functions have no cooldown, so N calls can be batched into 1 TX.
 *
 * Usage:
 *   npx tsx scripts/prefund-bot.ts --market NBTC --rounds 50
 *   npx tsx scripts/prefund-bot.ts --market NETH --rounds 50
 *   npx tsx scripts/prefund-bot.ts --market NSOL --rounds 50
 *
 * Requires LP_PRIVATE_KEY (or per-market key) in environment.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

// Contract addresses (same as config.ts)
const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const TOKENS_PACKAGE = '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731';
const TOKEN_FAUCET = '0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92';
const TOKENS_V2_FAUCET_PACKAGE = '0xc2d09b5e026b1d8378e8f70333e8e74ed3b5798715caa284bcb82d22cb60b78e';
const TOKEN_FAUCET_V2 = '0x39d18f61b17942dd6823d11a09393937e526619af2f7f707f6afc5c9453c75f2';
const NETH_PACKAGE = '0xe672843fd6e5388ca1248200059c6ef50e82a68689f42f7b9efb3e70dcabdf31';
const NETH_FAUCET_V2 = '0x8654e80b3e978aa0d5dca457f6b891e2c6cdbda4531d8c2ee7ab4e1251a0e50e';

const MARKET_CONFIGS: Record<string, {
  faucetType: 'v1' | 'v2';
  faucetV2Package?: string;
  faucetV2Object?: string;
  faucetV2Function?: string;
}> = {
  NBTC: { faucetType: 'v1' },
  NETH: { faucetType: 'v2', faucetV2Package: NETH_PACKAGE, faucetV2Object: NETH_FAUCET_V2 },
  NSOL: { faucetType: 'v2', faucetV2Package: TOKENS_V2_FAUCET_PACKAGE, faucetV2Object: TOKEN_FAUCET_V2, faucetV2Function: 'request_nsol' },
};

function parseArgs(): { market: string; rounds: number } {
  const args = process.argv.slice(2);
  let market = 'NBTC';
  let rounds = 50;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--market' && args[i + 1]) market = args[++i].toUpperCase();
    if (args[i] === '--rounds' && args[i + 1]) rounds = parseInt(args[++i], 10);
  }

  if (!MARKET_CONFIGS[market]) {
    console.error(`Unknown market: ${market}. Available: ${Object.keys(MARKET_CONFIGS).join(', ')}`);
    process.exit(1);
  }
  if (rounds < 1 || rounds > 200) {
    console.error('Rounds must be between 1 and 200');
    process.exit(1);
  }

  return { market, rounds };
}

function loadKeypair(market: string): Ed25519Keypair {
  const envKey = `LP_PRIVATE_KEY_${market}`;
  const keyStr = process.env[envKey] || process.env.LP_PRIVATE_KEY;

  if (!keyStr) {
    console.error(`Set ${envKey} or LP_PRIVATE_KEY in environment`);
    process.exit(1);
  }

  try {
    // Try bech32 format first (suiprivkey1...)
    const { secretKey } = decodeSuiPrivateKey(keyStr);
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch {
    // Fall back to hex format
    return Ed25519Keypair.fromSecretKey(Buffer.from(keyStr, 'hex'));
  }
}

function buildBatchedFaucetTx(market: string, rounds: number): Transaction {
  const config = MARKET_CONFIGS[market];
  const tx = new Transaction();
  tx.setGasBudget(500_000_000); // 0.5 NASUN, enough for 200 MoveCall

  if (config.faucetType === 'v1') {
    // V1: request_tokens gives NBTC + NUSDC per call
    for (let i = 0; i < rounds; i++) {
      tx.moveCall({
        target: `${TOKENS_PACKAGE}::faucet::request_tokens`,
        arguments: [tx.object(TOKEN_FAUCET)],
      });
    }
  } else {
    const pkg = config.faucetV2Package!;
    const obj = config.faucetV2Object!;
    const fn = config.faucetV2Function || 'request_tokens';

    for (let i = 0; i < rounds; i++) {
      // V2 base token
      tx.moveCall({
        target: `${pkg}::faucet_v2::${fn}`,
        arguments: [tx.object(obj)],
      });
      // V1 NUSDC (quote token)
      tx.moveCall({
        target: `${TOKENS_PACKAGE}::faucet::request_nusdc`,
        arguments: [tx.object(TOKEN_FAUCET)],
      });
    }
  }

  return tx;
}

async function main() {
  const { market, rounds } = parseArgs();
  const keypair = loadKeypair(market);
  const address = keypair.getPublicKey().toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  console.log(`Pre-funding ${market} bot`);
  console.log(`  Address: ${address}`);
  console.log(`  Rounds: ${rounds}`);
  console.log(`  RPC: ${RPC_URL}`);

  // Check gas balance
  const balance = await client.getBalance({ owner: address });
  const gasBalance = Number(balance.totalBalance) / 1e9;
  console.log(`  Gas balance: ${gasBalance.toFixed(4)} NASUN`);

  if (gasBalance < 1) {
    console.error('Insufficient gas. Request gas first via HTTP faucet.');
    process.exit(1);
  }

  // Build and execute batched faucet TX
  const tx = buildBatchedFaucetTx(market, rounds);

  console.log(`\nExecuting ${rounds}-round batched faucet TX...`);
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  if (result.effects?.status?.status !== 'success') {
    console.error('TX failed:', result.effects?.status?.error);
    process.exit(1);
  }

  console.log(`TX success: ${result.digest}`);
  await client.waitForTransaction({ digest: result.digest });
  console.log('Done. Tokens minted to bot address.');
}

main().catch((err) => {
  console.error('Pre-fund failed:', err);
  process.exit(1);
});
