/**
 * DEEP Coin Pre-Flight Probe (one-shot diagnostic)
 *
 * Verifies whether `swap_exact_base_for_quote` accepts a zero-DEEP coin on
 * Pado's NETH/NSOL/NUSDC pools. If the pools are whitelisted, taker fees are
 * waived and we can build the swap-and-deposit PTB without sourcing real DEEP
 * from the user's wallet.
 *
 * Run: pnpm --filter @nasun/pado-bots exec tsx scripts/probe-deep-fee.ts
 * Or:  cd apps/pado/bots && npx tsx scripts/probe-deep-fee.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';

// v8 fresh-genesis dev addresses (matching apps/pado/.env.local)
const DEEPBOOK_PACKAGE = process.env.VITE_DEEPBOOK_PACKAGE
  || '0xf0dce6bfc71db3f20be146e65a70cc721dd82d6bc1a1be84febfa58a1018ea00';
const DEEP_TOKEN_PACKAGE = process.env.VITE_DEEP_TOKEN
  || '0x642e81bd21a2dea6dd90d41a5f6bc18d6e63c0442f901d12198a894ed3b6a15a';
const DEEP_TYPE = `${DEEP_TOKEN_PACKAGE}::deep::DEEP`;

// Coin types: type identity uses originalPackageId (fresh publish: == packageId)
const NUSDC_TYPE = '0xeb10b5a62d591da68c4ea2bb2a18d2b440f855d6dfae2252d485733898ad5b11::nusdc::NUSDC';
const NBTC_TYPE  = '0xeb10b5a62d591da68c4ea2bb2a18d2b440f855d6dfae2252d485733898ad5b11::nbtc::NBTC';
const NETH_TYPE  = '0xe09adc42e0c830fe5f85b839fc8ff2d53045c06da1cf31abec8e72efb903daa9::neth::NETH';
const NSOL_TYPE  = '0xe09adc42e0c830fe5f85b839fc8ff2d53045c06da1cf31abec8e72efb903daa9::nsol::NSOL';

// Pool IDs from .env.local
const POOLS: Array<{ name: string; id: string; baseType: string; baseDecimals: number }> = [
  {
    name: 'NBTC_NUSDC',
    id: '0x1addff570f17f0e12fa14c5f986806ce21bd5cc0542c4548ebf011a56eb26ec9',
    baseType: NBTC_TYPE,
    baseDecimals: 8,
  },
  {
    name: 'NETH_NUSDC',
    id: '0x2fb410e4505fabc13b2791e801969cd9691ad2dc47173fb1b3d7e7811cc37209',
    baseType: NETH_TYPE,
    baseDecimals: 8,
  },
  {
    name: 'NSOL_NUSDC',
    id: '0xbdcaa69717ffcc5ce67a983903c0d77adabe944ad8d478e618345f66ee7e01c6',
    baseType: NSOL_TYPE,
    baseDecimals: 9,
  },
];

// Probe sender — any address works for devInspect (no signature required)
const PROBE_SENDER = '0x683aaf5da378a8beb292cbb8d8a6f63100e87cafb4f850975aa7efdf416d7d88';

async function probePool(client: SuiClient, pool: typeof POOLS[number]) {
  const tx = new Transaction();
  tx.setSender(PROBE_SENDER);

  // Tiny base amount: 1 unit raw (won't actually fill but tests the call shape)
  const baseAmountRaw = 1n;

  const [zeroBase] = tx.moveCall({
    target: '0x2::coin::zero',
    typeArguments: [pool.baseType],
  });
  // Mint 1 raw base by splitting from the zero coin's underlying balance.
  // Actually for a probe we just need _any_ Coin<base>. coin::zero produces it.
  // But swap_exact requires non-zero — so we'll bump via balance::increase_supply path?
  // Simpler approach: pass coin::zero directly and let swap revert with a known abort.
  // The error type tells us if DEEP zero works (we'd revert with EZeroBaseAmount or similar)
  // vs DEEP being insufficient (which is the question we care about).

  const [zeroDeep] = tx.moveCall({
    target: '0x2::coin::zero',
    typeArguments: [DEEP_TYPE],
  });

  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::pool::swap_exact_base_for_quote`,
    typeArguments: [pool.baseType, NUSDC_TYPE],
    arguments: [
      tx.object(pool.id),
      zeroBase,
      zeroDeep,
      tx.pure.u64(0n), // minQuoteOut = 0
      tx.object('0x6'),
    ],
  });

  console.log(`\n--- ${pool.name} (${pool.id.slice(0, 10)}...) ---`);
  try {
    const result = await client.devInspectTransactionBlock({
      sender: PROBE_SENDER,
      transactionBlock: tx,
    });
    const status = result.effects?.status;
    console.log('  status:', status?.status);
    if (status?.error) {
      console.log('  error :', status.error);
    } else {
      console.log('  ✓ devInspect succeeded — pool accepts coin::zero<DEEP>');
    }
    // Look at gas analysis to see what abort code surfaced
    if (result.effects?.gasUsed) {
      console.log('  gas  :', result.effects.gasUsed);
    }
  } catch (err) {
    console.log('  ✗ devInspect failed at request level:', (err as Error).message);
  }
}

async function probeOrderbookDepth(client: SuiClient, pool: typeof POOLS[number]) {
  const tx = new Transaction();
  tx.setSender(PROBE_SENDER);
  // get_quote_quantity_out is a public read fn — devInspect with arbitrary base amount
  // and observe quote_out + DEEP fee required
  const probeBaseRaw = BigInt(10 ** pool.baseDecimals); // 1 base unit
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::pool::get_quote_quantity_out`,
    typeArguments: [pool.baseType, NUSDC_TYPE],
    arguments: [
      tx.object(pool.id),
      tx.pure.u64(probeBaseRaw),
      tx.object('0x6'),
    ],
  });

  try {
    const result = await client.devInspectTransactionBlock({
      sender: PROBE_SENDER,
      transactionBlock: tx,
    });
    const ret = result.results?.[0]?.returnValues;
    if (!ret) {
      console.log('  no return values from get_quote_quantity_out');
      return;
    }
    // Returns (base_quantity_out, quote_quantity_out, deep_quantity_required) as u64
    console.log('  get_quote_quantity_out for 1 base unit:');
    ret.forEach((v, i) => console.log(`    [${i}]`, v));
  } catch (err) {
    console.log('  get_quote_quantity_out failed:', (err as Error).message);
  }
}

async function main() {
  const client = new SuiClient({ url: RPC_URL });
  console.log('RPC:', RPC_URL);
  console.log('DEEPBOOK_PACKAGE:', DEEPBOOK_PACKAGE);
  console.log('DEEP_TYPE:', DEEP_TYPE);

  for (const pool of POOLS) {
    await probePool(client, pool);
    await probeOrderbookDepth(client, pool);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
