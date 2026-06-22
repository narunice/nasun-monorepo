/**
 * Leaderboard top-2000 tiered airdrop (2026-06-22, post devnet v8 reset).
 *
 * Restores liquidity for active users wiped by the v8 reset. Recipients are the
 * union (best-rank-wins) of the Pado weekly trading leaderboard top-2000 and the
 * Nasun ecosystem leaderboard top-2000, deduped by wallet address, banned/admin
 * excluded. Source list produced by
 *   apps/network-explorer/api-server/src/scripts/extract-airdrop-recipients-2026-06-22.ts
 * -> data/airdrop-top2000-recipients-2026-06-22.json  ({ meta, recipients }).
 *
 * Per-rank-tier bundle (Moderate schedule + tiered NSN):
 *   tier1 (rank 1-500):    6,000 NUSDC | 0.060 NBTC | 1.2 NETH | 24 NSOL | 200 NSN
 *   tier2 (rank 501-1000): 4,500 NUSDC | 0.045 NBTC | 0.9 NETH | 18 NSOL | 150 NSN
 *   tier3 (rank 1001-1500):3,000 NUSDC | 0.030 NBTC | 0.6 NETH | 12 NSOL | 100 NSN
 *   tier4 (rank 1501-2000):1,500 NUSDC | 0.015 NBTC | 0.3 NETH |  6 NSOL |  50 NSN
 *
 * Mint path (admin holds NO TreasuryCap): no-cooldown faucet request_tokens
 * accumulates the four ERC-style tokens, then merge -> split -> transfer.
 *   v1 faucet request_tokens -> 0.01 NBTC + 2,500 NUSDC per call (NBTC-bound)
 *   v2 faucet request_tokens -> 0.6 NETH + 12 NSOL per call    (NETH-bound)
 * NSN is native (0x2::sui::SUI); admin already holds ~305M, so it is distributed
 * by splitting from the gas coin (gas-smashing) inside each distribute PTB.
 *
 * Signer = token admin 0x98f5339a (keystore alias admin-v8), loaded in-memory.
 *
 * Phases (run all by default, or one via --phase mint|merge|distribute):
 *   mint      accumulate >= totals of the 4 minted tokens in the admin wallet
 *   merge     consolidate each of the 4 tokens into a single coin
 *   distribute  split + transfer the 5-token tiered bundle to each recipient
 *
 * Usage:
 *   node --import tsx scripts/airdrop-top2000-tiered-2026-06-22.ts --dry-run
 *   node --import tsx scripts/airdrop-top2000-tiered-2026-06-22.ts --phase mint
 *   node --import tsx scripts/airdrop-top2000-tiered-2026-06-22.ts --phase merge
 *   node --import tsx scripts/airdrop-top2000-tiered-2026-06-22.ts --phase distribute
 *   node --import tsx scripts/airdrop-top2000-tiered-2026-06-22.ts            # all
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) { console.error('mainnet refused'); process.exit(1); }

const ADMIN_ADDR = '0x98f5339a8d5c6ba1c1478d8b405711c816e13250553a2c20ec8b839abf454a6c';

const V1_PKG = '0xeb10b5a62d591da68c4ea2bb2a18d2b440f855d6dfae2252d485733898ad5b11';
const V1_FAUCET = '0x336c5db9b9aef143feddb1376c4a7f2a6dc10dabdf6185947f3ac48ddadaf6ff';
const V2_PKG = '0xe09adc42e0c830fe5f85b839fc8ff2d53045c06da1cf31abec8e72efb903daa9';
const V2_FAUCET = '0xf6ff5936a307f0c02e7a812c03a17a3ce95e7252a00ec27a809ead96641fcb36';

const SUI_TYPE = '0x2::sui::SUI';

interface Tok { type: string; dec: number; faucetPerCall: bigint; }
// Minted via faucet (admin holds no TreasuryCap).
const NUSDC: Tok = { type: `${V1_PKG}::nusdc::NUSDC`, dec: 6, faucetPerCall: 2_500n * 10n ** 6n };
const NBTC: Tok = { type: `${V1_PKG}::nbtc::NBTC`, dec: 8, faucetPerCall: 1_000_000n /* 0.01 */ };
const NETH: Tok = { type: `${V2_PKG}::neth::NETH`, dec: 8, faucetPerCall: 60_000_000n /* 0.6 */ };
const NSOL: Tok = { type: `${V2_PKG}::nsol::NSOL`, dec: 9, faucetPerCall: 12n * 10n ** 9n };
// Native: not minted, distributed by splitting the gas coin.
const NSN: Tok = { type: SUI_TYPE, dec: 9, faucetPerCall: 0n };

// Minted-token order used for mint/merge/distribute of object coins.
const MINTED: Array<[string, Tok]> = [['NUSDC', NUSDC], ['NBTC', NBTC], ['NETH', NETH], ['NSOL', NSOL]];

// ---- Tier schedule (raw amounts per token) ----
const TIER: Record<number, { NUSDC: bigint; NBTC: bigint; NETH: bigint; NSOL: bigint; NSN: bigint }> = {
  1: { NUSDC: 6_000n * 10n ** 6n, NBTC: 6_000_000n, NETH: 120_000_000n, NSOL: 24n * 10n ** 9n, NSN: 200n * 10n ** 9n },
  2: { NUSDC: 4_500n * 10n ** 6n, NBTC: 4_500_000n, NETH: 90_000_000n,  NSOL: 18n * 10n ** 9n, NSN: 150n * 10n ** 9n },
  3: { NUSDC: 3_000n * 10n ** 6n, NBTC: 3_000_000n, NETH: 60_000_000n,  NSOL: 12n * 10n ** 9n, NSN: 100n * 10n ** 9n },
  4: { NUSDC: 1_500n * 10n ** 6n, NBTC: 1_500_000n, NETH: 30_000_000n,  NSOL: 6n * 10n ** 9n,  NSN: 50n * 10n ** 9n },
};

const MINT_BATCH = 200;   // faucet calls per PTB (prefund-bot proven)
const MERGE_BATCH = 400;  // coins merged per PTB
const DIST_BATCH = 100;   // recipients per distribute PTB
const GAS_BUDGET = 12_000_000_000n;        // 12 NASUN for mint/merge PTBs
const DIST_GAS_BUDGET = 20_000_000_000n;   // 20 NASUN for distribute (5 tokens + gas-split)

const __dir = dirname(fileURLToPath(import.meta.url));
type Recipient = { nasun: string; rank: number; tier: number };

function loadRecipients(): { recips: Recipient[]; sha256: string } {
  const path = process.env.RECIPIENTS_PATH || join(__dir, 'data', 'airdrop-top2000-recipients-2026-06-22.json');
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { meta?: { sha256?: string }; recipients: Recipient[] };
  const arr = parsed.recipients;
  const seen = new Set<string>();
  for (const r of arr) {
    if (!/^0x[0-9a-f]{64}$/.test(r.nasun)) throw new Error(`bad recipient ${r.nasun}`);
    if (!TIER[r.tier]) throw new Error(`bad tier ${r.tier} for ${r.nasun}`);
    if (seen.has(r.nasun)) throw new Error(`dup recipient ${r.nasun}`);
    seen.add(r.nasun);
  }
  // Re-derive the canonical hash to prove the file matches extraction output.
  const sorted = [...arr].sort((a, b) => a.rank - b.rank || a.nasun.localeCompare(b.nasun));
  const sha256 = createHash('sha256').update(sorted.map((r) => `${r.nasun}:${r.tier}`).join('\n')).digest('hex');
  if (parsed.meta?.sha256 && parsed.meta.sha256 !== sha256) {
    throw new Error(`recipient sha256 mismatch: file meta ${parsed.meta.sha256} vs recomputed ${sha256}`);
  }
  return { recips: arr, sha256 };
}

function loadAdmin(): Ed25519Keypair {
  const path = process.env.SUI_KEYSTORE_PATH || join(homedir(), '.sui', 'sui_config', 'sui.keystore');
  const entries = JSON.parse(readFileSync(path, 'utf8')) as string[];
  for (const b64 of entries) {
    const bytes = Buffer.from(b64, 'base64');
    if (bytes.length !== 33 || bytes[0] !== 0x00) continue;
    const kp = Ed25519Keypair.fromSecretKey(bytes.subarray(1, 33));
    if (kp.toSuiAddress().toLowerCase() === ADMIN_ADDR.toLowerCase()) return kp;
  }
  throw new Error(`admin key ${ADMIN_ADDR} not in keystore ${path}`);
}

function fmt(raw: bigint, dec: number): string {
  const neg = raw < 0n; const a = neg ? -raw : raw;
  const base = 10n ** BigInt(dec);
  const whole = a / base; const frac = (a % base).toString().padStart(dec, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${frac ? '.' + frac : ''}`;
}

async function balance(client: SuiClient, type: string): Promise<bigint> {
  const b = await client.getBalance({ owner: ADMIN_ADDR, coinType: type });
  return BigInt(b.totalBalance);
}

async function exec(client: SuiClient, admin: Ed25519Keypair, tx: Transaction, label: string, budget = GAS_BUDGET): Promise<string> {
  tx.setGasBudget(budget);
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await client.signAndExecuteTransaction({ signer: admin, transaction: tx, options: { showEffects: true } });
      if (r.effects?.status?.status !== 'success') throw new Error(`status: ${r.effects?.status?.error}`);
      await client.waitForTransaction({ digest: r.digest });
      return r.digest;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retriable = /not available for consumption|current version|ObjectVersionUnavailable|locked|reference is not available|Equivocation|HTTP (?:429|5\d\d)|fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i.test(msg);
      if (!retriable || attempt === 5) throw new Error(`${label} failed: ${msg}`);
      await new Promise((r) => setTimeout(r, 2500 * attempt));
    }
  }
  throw new Error(`${label}: unreachable`);
}

// ---- totals over the tiered recipient list ----
function totals(recips: Recipient[]) {
  const t = { NUSDC: 0n, NBTC: 0n, NETH: 0n, NSOL: 0n, NSN: 0n };
  for (const r of recips) {
    const a = TIER[r.tier];
    t.NUSDC += a.NUSDC; t.NBTC += a.NBTC; t.NETH += a.NETH; t.NSOL += a.NSOL; t.NSN += a.NSN;
  }
  return t;
}

// ---- MINT ----
async function mintCombined(client: SuiClient, admin: Ed25519Keypair, faucetPkg: string, faucetObj: string, bindingTok: Tok, bindingTarget: bigint, label: string): Promise<void> {
  for (let iter = 0; iter < 120; iter++) {
    const have = await balance(client, bindingTok.type);
    if (have >= bindingTarget) { console.log(`  [${label}] target reached (${fmt(have, bindingTok.dec)})`); return; }
    const shortfall = bindingTarget - have;
    const callsNeeded = Number((shortfall + bindingTok.faucetPerCall - 1n) / bindingTok.faucetPerCall);
    const calls = Math.min(callsNeeded, MINT_BATCH);
    const tx = new Transaction();
    for (let i = 0; i < calls; i++) {
      tx.moveCall({ target: `${faucetPkg}::${faucetPkg === V1_PKG ? 'faucet' : 'faucet_v2'}::request_tokens`, arguments: [tx.object(faucetObj)] });
    }
    const dig = await exec(client, admin, tx, `${label} mint x${calls}`);
    console.log(`  [${label}] +${calls} calls  (have ${fmt(have, bindingTok.dec)} -> target ${fmt(bindingTarget, bindingTok.dec)})  ${dig.slice(0, 10)}`);
  }
  throw new Error(`${label}: mint did not reach target after 120 iterations`);
}

async function phaseMint(client: SuiClient, admin: Ed25519Keypair, recips: Recipient[]): Promise<void> {
  const t = totals(recips);
  console.log('PHASE mint: ensuring admin balances >= totals');
  await mintCombined(client, admin, V1_PKG, V1_FAUCET, NBTC, t.NBTC, 'v1 NBTC+NUSDC');
  await mintCombined(client, admin, V2_PKG, V2_FAUCET, NETH, t.NETH, 'v2 NETH+NSOL');
  // Top up byproduct tokens (NUSDC, NSOL) if the binding mint underdelivered.
  for (const [name, tok, target, pkg, obj, fn] of [
    ['NUSDC', NUSDC, t.NUSDC, V1_PKG, V1_FAUCET, 'request_nusdc'],
    ['NSOL', NSOL, t.NSOL, V2_PKG, V2_FAUCET, 'request_nsol'],
  ] as [string, Tok, bigint, string, string, string][]) {
    let have = await balance(client, tok.type);
    while (have < target) {
      const calls = Math.min(Number((target - have + tok.faucetPerCall - 1n) / tok.faucetPerCall), MINT_BATCH);
      const tx = new Transaction();
      for (let i = 0; i < calls; i++) tx.moveCall({ target: `${pkg}::${pkg === V1_PKG ? 'faucet' : 'faucet_v2'}::${fn}`, arguments: [tx.object(obj)] });
      await exec(client, admin, tx, `${name} topup x${calls}`);
      have = await balance(client, tok.type);
    }
  }
  console.log('PHASE mint: done. balances:');
  for (const [name, tok] of MINTED) console.log(`  ${name}: ${fmt(await balance(client, tok.type), tok.dec)} (need ${fmt((t as any)[name], tok.dec)})`);
  console.log(`  NSN (native, not minted): ${fmt(await balance(client, SUI_TYPE), 9)} (need ${fmt(t.NSN, 9)} + gas)`);
}

// ---- MERGE ----
async function listCoinIds(client: SuiClient, type: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await client.getCoins({ owner: ADMIN_ADDR, coinType: type, cursor, limit: 200 });
    for (const c of page.data) ids.push(c.coinObjectId);
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return ids;
}

async function phaseMerge(client: SuiClient, admin: Ed25519Keypair): Promise<void> {
  console.log('PHASE merge: consolidating each minted token into one coin');
  for (const [name, tok] of MINTED) {
    const ids = await listCoinIds(client, tok.type);
    if (ids.length <= 1) { console.log(`  ${name}: already ${ids.length} coin`); continue; }
    const primary = ids[0];
    const rest = ids.slice(1);
    for (let i = 0; i < rest.length; i += MERGE_BATCH) {
      const chunk = rest.slice(i, i + MERGE_BATCH);
      const tx = new Transaction();
      tx.mergeCoins(tx.object(primary), chunk.map((id) => tx.object(id)));
      await exec(client, admin, tx, `${name} merge ${i}-${i + chunk.length}`);
      console.log(`  ${name}: merged ${Math.min(i + chunk.length, rest.length)}/${rest.length}`);
    }
    console.log(`  ${name}: consolidated (${fmt(await balance(client, tok.type), tok.dec)})`);
  }
  // NSN: not pre-merged into an explicit primary. Distribution splits from the
  // gas coin (gas-smashing across admin's NSN coins), so no merge is required.
}

// ---- DISTRIBUTE ----
async function primaryCoinId(client: SuiClient, type: string): Promise<string> {
  const ids = await listCoinIds(client, type);
  if (ids.length === 0) throw new Error(`no coin for ${type}`);
  if (ids.length > 1) throw new Error(`${type} not merged (${ids.length} coins); run --phase merge`);
  return ids[0];
}

async function phaseDistribute(client: SuiClient, admin: Ed25519Keypair, recips: Recipient[]): Promise<void> {
  console.log(`PHASE distribute: ${recips.length} recipients`);
  const t = totals(recips);
  const primaries: Record<string, string> = {};
  for (const [name, tok] of MINTED) {
    primaries[name] = await primaryCoinId(client, tok.type);
    const have = await balance(client, tok.type);
    if (have < (t as any)[name]) throw new Error(`${name} insufficient: have ${fmt(have, tok.dec)} need ${fmt((t as any)[name], tok.dec)}`);
  }
  const nsnHave = await balance(client, SUI_TYPE);
  if (nsnHave < t.NSN + DIST_GAS_BUDGET) throw new Error(`NSN insufficient: have ${fmt(nsnHave, 9)} need ${fmt(t.NSN, 9)} + gas`);

  let done = 0;
  for (let i = 0; i < recips.length; i += DIST_BATCH) {
    const batch = recips.slice(i, i + DIST_BATCH);
    const tx = new Transaction();
    const parts: Record<string, ReturnType<Transaction['splitCoins']>> = {};
    for (const [name, tok] of MINTED) {
      parts[name] = tx.splitCoins(tx.object(primaries[name]), batch.map((r) => (TIER[r.tier] as any)[name] as bigint));
    }
    // NSN from the gas coin (gas-smashing). Returned change stays with admin.
    const nsnParts = tx.splitCoins(tx.gas, batch.map((r) => TIER[r.tier].NSN));
    batch.forEach((r, j) => {
      tx.transferObjects([parts.NUSDC[j], parts.NBTC[j], parts.NETH[j], parts.NSOL[j], nsnParts[j]], r.nasun);
    });
    const dig = await exec(client, admin, tx, `distribute ${i}-${i + batch.length}`, DIST_GAS_BUDGET);
    done += batch.length;
    console.log(`  distributed ${done}/${recips.length}  ${dig.slice(0, 10)}`);
  }
  console.log('PHASE distribute: done');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const phase = args.includes('--phase') ? args[args.indexOf('--phase') + 1] : 'all';
  const { recips, sha256 } = loadRecipients();
  const t = totals(recips);

  const tierCounts = [0, 0, 0, 0, 0];
  for (const r of recips) tierCounts[r.tier]++;

  const v1Calls = Math.ceil(Number(t.NBTC / NBTC.faucetPerCall));
  const v2Calls = Math.ceil(Number(t.NETH / NETH.faucetPerCall));

  console.log(`Leaderboard top-2000 tiered airdrop - ${recips.length} recipients`);
  console.log(`  recipients sha256: ${sha256}`);
  console.log(`  tier counts: t1=${tierCounts[1]} t2=${tierCounts[2]} t3=${tierCounts[3]} t4=${tierCounts[4]}`);
  console.log(`  TOTALS: NUSDC ${fmt(t.NUSDC, 6)} | NBTC ${fmt(t.NBTC, 8)} | NETH ${fmt(t.NETH, 8)} | NSOL ${fmt(t.NSOL, 9)} | NSN ${fmt(t.NSN, 9)}`);
  console.log(`  faucet calls (mint): v1 ${v1Calls} (NBTC-bound, NUSDC byproduct ${fmt(BigInt(v1Calls) * NUSDC.faucetPerCall, 6)}) | v2 ${v2Calls} (NETH-bound, NSOL byproduct ${fmt(BigInt(v2Calls) * NSOL.faucetPerCall, 9)})`);
  console.log(`  PTB est: mint ~${Math.ceil(v1Calls / MINT_BATCH) + Math.ceil(v2Calls / MINT_BATCH)} + merge + distribute ${Math.ceil(recips.length / DIST_BATCH)}`);
  console.log(`  per-tier bundle:`);
  for (const k of [1, 2, 3, 4]) {
    const a = TIER[k];
    console.log(`    tier${k} (x${tierCounts[k]}): ${fmt(a.NUSDC, 6)} NUSDC | ${fmt(a.NBTC, 8)} NBTC | ${fmt(a.NETH, 8)} NETH | ${fmt(a.NSOL, 9)} NSOL | ${fmt(a.NSN, 9)} NSN`);
  }
  console.log(`  signer (admin): ${ADMIN_ADDR}`);
  if (dry) { console.log('\n[DRY RUN] no on-chain actions'); return; }

  const client = new SuiClient({ url: RPC_URL });
  const admin = loadAdmin();
  if (admin.toSuiAddress().toLowerCase() !== ADMIN_ADDR.toLowerCase()) { console.error('signer != admin'); process.exit(1); }
  const gas = Number(await balance(client, SUI_TYPE)) / 1e9;
  console.log(`  admin NSN balance: ${gas.toLocaleString('en-US')} NSN (need ${fmt(t.NSN, 9)} + gas)\n`);
  if (BigInt(Math.floor(gas)) * 10n ** 9n < t.NSN + 5_000n * 10n ** 9n) { console.error('admin NSN too low for distribution + gas'); process.exit(1); }

  if (phase === 'all' || phase === 'mint') await phaseMint(client, admin, recips);
  if (phase === 'all' || phase === 'merge') await phaseMerge(client, admin);
  if (phase === 'all' || phase === 'distribute') await phaseDistribute(client, admin, recips);
  console.log('\nAirdrop complete.');
}
main().catch((e) => { console.error('Fatal:', e instanceof Error ? e.message : e); process.exit(1); });
