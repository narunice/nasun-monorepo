/**
 * Cancel the 17 orphaned prediction markets created 2026-06-22 with the WRONG
 * resolver (0xd413721d, a stale bots/.env wallet that no live keeper runs), so
 * they never auto-resolve. They were recreated with the live keeper resolver
 * (0x5cbc8390); these originals are duplicates with zero trades/positions.
 *
 * admin_cancel_market(&AdminCap, &mut Market, &Clock) flips status -> CANCELLED
 * with no time gate, which drops them from the frontend's default "open" list.
 *
 * SAFETY: each target is read on-chain first and only cancelled if its resolver
 * == ORPHAN_RESOLVER and status == OPEN. Any market with the live resolver
 * (0x5cbc8390) is refused, so the good recreated markets can never be hit.
 *
 * Signer = AdminCap owner, loaded in-memory from the Sui keystore (admin-v8).
 *
 * Usage:
 *   node --import tsx apps/pado/bots/scripts/cancel-orphan-markets-2026-06-22.ts --dry-run
 *   node --import tsx apps/pado/bots/scripts/cancel-orphan-markets-2026-06-22.ts          # live
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const CLOCK_ID = '0x6';
const PACKAGE_ID = '0xa5e996e74ee9be7c7545e380d68d4f318d3c9a8d0cfd552a25482529481d14a9';
const ADMIN_CAP = '0x12e0e82eb703fcc68f611df54768017bbaf7a1ab2956867b93ca025c3f1ac0ac';
// The wrong/orphan resolver these 17 were created with. Only markets with THIS
// resolver may be cancelled by this script.
const ORPHAN_RESOLVER = '0xd413721d43dc90a33e9ab8acc4c4db8fbcc4593ea8ff9ea6e8116cd67058e79c';
const LIVE_RESOLVER = '0x5cbc8390ae709b0358f304fd76691dda1f03eae514a9592153125c8cff23aeb0';

const ORPHANS: { id: string; label: string }[] = [
  { id: '0xef3c4af85e3d83cdfc894b5fb231729808c501a40fbe688be77bb4f085b8a681', label: 'BTC>65k' },
  { id: '0xc83cdc9180482b3b63dda9a6d585f48029e7e75ed6fe3f77e7828eb17ff599d1', label: 'ETH>1750' },
  { id: '0x3b06f3c4ffcd6510853a147fc52e2eddc22fad405b3e950c468af5895040c762', label: 'SOL>75' },
  { id: '0xf6bb09bd1af096b7aed2eccf92633ab8b06c7fad56cee0d3ddc008d5b61eec73', label: 'NVDA>212' },
  { id: '0xbde9e4392f062a3d645d337801df950a32f8d949a88474c38bce5a547985d831', label: 'AAPL>300' },
  { id: '0x4e583eea7e85f2f998936b43e6f12ae2295168d40f50beecf513423e004d3af7', label: 'TSLA>405' },
  { id: '0x9ead8331ee19cca2cf183a43a6ff361f5a69dd16d0f826d8db9d0a52e44c3fc7', label: 'F9 Starlink 17-45' },
  { id: '0x1395578ab5e4920707c13bab50027acbae34a1360a78fe409e90e8bc68d879d3', label: 'Pegasus Swift Boost' },
  { id: '0xf52551c226e96270affb2acfde0a8d722641e5ed7cadc794316b4a5bfde0d75d', label: 'Seoul rain' },
  { id: '0x92a1c8bd8b06e311bc32d9adcd895501d4108dcd6decd330c4c604d5e50841a5', label: 'Seoul heat' },
  { id: '0x3a45c9ea9621c4d3e983a10d2d3c1b207d41994bffd909005de0d3951f7b142b', label: 'SUI-CAN' },
  { id: '0xd4f386c4c1329e413f7f894c303e0a8308555206b0a86e4ad5bdee779add2139', label: 'BIH-QAT' },
  { id: '0x7ac0efe9b0f06a6439ec5162e22cb5739d10ee630fd635dbf54622d56af0ae94', label: 'MAR-HAI' },
  { id: '0x0a649920306856cc334a06296c6d67c54bd337d5c5a4a89d75ea4877f06bc95d', label: 'SCO-BRA' },
  { id: '0x31fd98e3b72a315236bc9180a5573f793317b64bb4edad331608b8c6001df41e', label: 'RSA-KOR' },
  { id: '0x4c656a403e2f66ff104c3fdee647bf129988902df108f518fc91254a3fb72f73', label: 'US #1 Drake' },
  { id: '0x4344f8d0ee7ec3ca08a0f44d35c079ccc6b90ca4600ab359ec6eeabdbbe6128f', label: 'KR #1 CORTIS' },
];

function loadKeypairFromKeystore(targetAddr: string): Ed25519Keypair {
  const path = process.env.SUI_KEYSTORE_PATH
    || join(homedir(), '.sui', 'sui_config', 'sui.keystore');
  const entries = JSON.parse(readFileSync(path, 'utf8')) as string[];
  const want = targetAddr.toLowerCase();
  for (const b64 of entries) {
    const bytes = Buffer.from(b64, 'base64');
    if (bytes.length !== 33 || bytes[0] !== 0x00) continue;
    const kp = Ed25519Keypair.fromSecretKey(bytes.subarray(1, 33));
    if (kp.toSuiAddress().toLowerCase() === want) return kp;
  }
  throw new Error(`admin key for ${targetAddr} not found in keystore ${path}`);
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run');
  const client = new SuiClient({ url: RPC_URL });

  // Read each target and classify. Only OPEN + ORPHAN_RESOLVER markets qualify.
  const objs = await client.multiGetObjects({
    ids: ORPHANS.map((o) => o.id),
    options: { showContent: true },
  });
  const toCancel: { id: string; label: string }[] = [];
  for (let i = 0; i < ORPHANS.length; i++) {
    const o = ORPHANS[i];
    const fields = (objs[i]?.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
    if (!fields) { console.log(`  SKIP ${o.label}: not found`); continue; }
    const resolver = String(fields.resolver).toLowerCase();
    const status = Number(fields.status);
    if (resolver === LIVE_RESOLVER) {
      console.log(`  REFUSE ${o.label} (${o.id.slice(0, 10)}): resolver is LIVE keeper - this is a good market, NOT cancelling`);
      continue;
    }
    if (resolver !== ORPHAN_RESOLVER) {
      console.log(`  SKIP ${o.label}: unexpected resolver ${resolver.slice(0, 14)} - not cancelling`);
      continue;
    }
    if (status !== 0) {
      console.log(`  SKIP ${o.label}: status=${status} (already resolved/cancelled)`);
      continue;
    }
    toCancel.push(o);
  }

  console.log(`\nQualified orphans to cancel: ${toCancel.length}/${ORPHANS.length}`);
  toCancel.forEach((o) => console.log(`  - ${o.label} ${o.id}`));
  if (dry) { console.log('\n[DRY RUN]'); return; }
  if (toCancel.length === 0) { console.log('nothing to cancel'); return; }

  const capObj = await client.getObject({ id: ADMIN_CAP, options: { showOwner: true } });
  const capOwner = (capObj.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (!capOwner) { console.error('AdminCap has no owner'); process.exit(1); }
  const admin = process.env.PREDICTION_ADMIN_KEY_OVERRIDE
    ? Ed25519Keypair.fromSecretKey(Buffer.from(process.env.PREDICTION_ADMIN_KEY_OVERRIDE.replace(/^0x/, ''), 'hex'))
    : loadKeypairFromKeystore(capOwner);
  if (admin.toSuiAddress().toLowerCase() !== capOwner.toLowerCase()) {
    console.error('signer != AdminCap owner'); process.exit(1);
  }

  // One PTB cancels all qualified orphans atomically.
  const tx = new Transaction();
  for (const o of toCancel) {
    tx.moveCall({
      target: `${PACKAGE_ID}::prediction_market::admin_cancel_market`,
      arguments: [tx.object(ADMIN_CAP), tx.object(o.id), tx.object(CLOCK_ID)],
    });
  }
  const r = await client.signAndExecuteTransaction({
    signer: admin, transaction: tx,
    options: { showEffects: true },
  });
  if (r.effects?.status?.status !== 'success') {
    console.error(`TX failed: ${r.effects?.status?.error}`); process.exit(1);
  }
  await client.waitForTransaction({ digest: r.digest });
  console.log(`\nCancelled ${toCancel.length} orphan markets in ${r.digest}`);
}
main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
