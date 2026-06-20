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
const TOKENS_PACKAGE = '0xeb10b5a62d591da68c4ea2bb2a18d2b440f855d6dfae2252d485733898ad5b11';
const TOKEN_FAUCET = '0x336c5db9b9aef143feddb1376c4a7f2a6dc10dabdf6185947f3ac48ddadaf6ff';
// devnet_tokens_v2 (v8): NETH + NSOL consolidated in ONE package + ONE faucet.
const TOKENS_V2_FAUCET_PACKAGE = '0xe09adc42e0c830fe5f85b839fc8ff2d53045c06da1cf31abec8e72efb903daa9';
const TOKEN_FAUCET_V2 = '0xf6ff5936a307f0c02e7a812c03a17a3ce95e7252a00ec27a809ead96641fcb36';
const NETH_PACKAGE = '0xe09adc42e0c830fe5f85b839fc8ff2d53045c06da1cf31abec8e72efb903daa9';
const NETH_FAUCET_PACKAGE = '0xe09adc42e0c830fe5f85b839fc8ff2d53045c06da1cf31abec8e72efb903daa9';
const NETH_FAUCET_V2 = '0xf6ff5936a307f0c02e7a812c03a17a3ce95e7252a00ec27a809ead96641fcb36';

const NBTC_TYPE = `${TOKENS_PACKAGE}::nbtc::NBTC`;
const NETH_TYPE = `${NETH_PACKAGE}::neth::NETH`;
const NSOL_TYPE = `0xe09adc42e0c830fe5f85b839fc8ff2d53045c06da1cf31abec8e72efb903daa9::nsol::NSOL`;

interface PrefundMarketConfig {
  baseType: string;
  faucetType: 'v1' | 'v2';
  faucetV2Package?: string;
  faucetV2Object?: string;
  faucetV2Function?: string;
}

// See packages/devnet-tokens-v2 + lib/config.ts INVARIANT block for the
// faucet/baseType pairing rules. Adding a new market here REQUIRES verifying
// the faucet object holds a TreasuryCap of the matching baseType.
const MARKET_CONFIGS: Record<string, PrefundMarketConfig> = {
  NBTC: { baseType: NBTC_TYPE, faucetType: 'v1' },
  // v8: NETH shares the consolidated devnet_tokens_v2 faucet (NETH_FAUCET_* alias
  // TOKENS_V2_*). request_tokens mints NETH + NSOL together for bulk prefunding.
  NETH: { baseType: NETH_TYPE, faucetType: 'v2', faucetV2Package: NETH_FAUCET_PACKAGE, faucetV2Object: NETH_FAUCET_V2, faucetV2Function: 'request_tokens' },
  NSOL: { baseType: NSOL_TYPE, faucetType: 'v2', faucetV2Package: TOKENS_V2_FAUCET_PACKAGE, faucetV2Object: TOKEN_FAUCET_V2, faucetV2Function: 'request_nsol' },
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
  tx.setGasBudget(10_000_000_000); // 10 NASUN for 200 MoveCall batched

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

  // Preflight: confirm the faucet we are about to call actually mints the
  // expected baseType for this market. Stops the 2026-05-18-style silent
  // wrong-type mint at the script boundary, before 100s of useless rounds.
  const cfg = MARKET_CONFIGS[market];
  try {
    const { verifyMarketFaucet } = await import('../lib/preflight.js');
    await verifyMarketFaucet(
      { name: market, baseType: cfg.baseType, faucetType: cfg.faucetType, faucetV2Object: cfg.faucetV2Object },
      { rpcUrl: RPC_URL },
    );
    console.log(`  Preflight: ${market} faucet ↔ baseType verified`);
  } catch (err) {
    console.error('PREFLIGHT FAILED — refusing to mint.');
    console.error(err instanceof Error ? err.message : err);
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
