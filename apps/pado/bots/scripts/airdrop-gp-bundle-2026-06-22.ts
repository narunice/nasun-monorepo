/**
 * Genesis Pass holder airdrop (2026-06-22, post devnet v8 reset).
 *
 * Sends every GP holder with a linked Nasun wallet a bundle to restore Pado
 * liquidity after the reset wiped balances:
 *   25,000 NUSDC + 0.25 NBTC + 5 NETH + 100 NSOL  per holder.
 *
 * Recipients: data/gp-recipients-2026-06-22.json (384 Nasun wallets), derived
 * from DynamoDB nasun-nft-ownership (ETH#LATEST, GP contract
 * 0x561d4a687e...) cross-referenced with UserProfiles linkedAccounts.metamask
 * -> walletAddress. 386 on-chain GP holders, 384 with a valid Nasun wallet.
 *
 * Mint path: admin holds NO TreasuryCap (create_faucet consumed them into the
 * shared faucet objects), so tokens are minted by repeatedly calling the
 * no-cooldown faucet request_tokens, then merged and split to recipients.
 *   v1 faucet request_tokens -> 0.01 NBTC + 2,500 NUSDC per call
 *   v2 faucet request_tokens -> 0.6 NETH + 12 NSOL per call
 *
 * Signer = AdminCap owner / token admin 0x98f5339a (keystore alias admin-v8),
 * loaded in-memory (no secret written to disk).
 *
 * Phases (run all by default, or one via --phase):
 *   mint      accumulate >= total needed in the admin wallet
 *   merge     consolidate each token's coins into one
 *   distribute split + transfer the bundle to each recipient
 *
 * Usage:
 *   node --import tsx scripts/airdrop-gp-bundle-2026-06-22.ts --dry-run
 *   node --import tsx scripts/airdrop-gp-bundle-2026-06-22.ts --phase mint
 *   node --import tsx scripts/airdrop-gp-bundle-2026-06-22.ts --phase merge
 *   node --import tsx scripts/airdrop-gp-bundle-2026-06-22.ts --phase distribute
 *   node --import tsx scripts/airdrop-gp-bundle-2026-06-22.ts            # all phases
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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

interface Tok { type: string; dec: number; perBundle: bigint; faucetPerCall: bigint; }
const NUSDC: Tok = { type: `${V1_PKG}::nusdc::NUSDC`, dec: 6, perBundle: 25_000n * 10n ** 6n, faucetPerCall: 2_500n * 10n ** 6n };
const NBTC: Tok = { type: `${V1_PKG}::nbtc::NBTC`, dec: 8, perBundle: 25_000_000n /* 0.25 */, faucetPerCall: 1_000_000n /* 0.01 */ };
const NETH: Tok = { type: `${V2_PKG}::neth::NETH`, dec: 8, perBundle: 5n * 10n ** 8n, faucetPerCall: 60_000_000n /* 0.6 */ };
const NSOL: Tok = { type: `${V2_PKG}::nsol::NSOL`, dec: 9, perBundle: 100n * 10n ** 9n, faucetPerCall: 12n * 10n ** 9n };
const TOKENS: Record<string, Tok> = { NUSDC, NBTC, NETH, NSOL };

const MINT_BATCH = 200;   // faucet calls per PTB (prefund-bot proven)
const MERGE_BATCH = 400;  // coins merged per PTB
const DIST_BATCH = 100;   // recipients per distribute PTB
const GAS_BUDGET = 12_000_000_000n; // 12 NASUN per heavy PTB

const __dir = dirname(fileURLToPath(import.meta.url));
type Recipient = { nasun: string; tokenIds: string[] };

function loadRecipients(): Recipient[] {
  const path = process.env.GP_RECIPIENTS_PATH || join(__dir, 'data', 'gp-recipients-2026-06-22.json');
  const arr = JSON.parse(readFileSync(path, 'utf8')) as Recipient[];
  const seen = new Set<string>();
  for (const r of arr) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(r.nasun)) throw new Error(`bad recipient ${r.nasun}`);
    if (seen.has(r.nasun.toLowerCase())) throw new Error(`dup recipient ${r.nasun}`);
    seen.add(r.nasun.toLowerCase());
  }
  return arr;
}

function loadAdmin(): Ed25519Keypair {
  if (process.env.PREDICTION_ADMIN_KEY_OVERRIDE) {
    return Ed25519Keypair.fromSecretKey(Buffer.from(process.env.PREDICTION_ADMIN_KEY_OVERRIDE.replace(/^0x/, ''), 'hex'));
  }
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

async function exec(client: SuiClient, admin: Ed25519Keypair, tx: Transaction, label: string): Promise<string> {
  tx.setGasBudget(GAS_BUDGET);
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

// ---- totals ----
function totals(n: number) {
  return {
    NUSDC: NUSDC.perBundle * BigInt(n),
    NBTC: NBTC.perBundle * BigInt(n),
    NETH: NETH.perBundle * BigInt(n),
    NSOL: NSOL.perBundle * BigInt(n),
  };
}

// ---- MINT ----
async function mintCombined(
  client: SuiClient, admin: Ed25519Keypair,
  faucetPkg: string, faucetObj: string,
  bindingTok: Tok, bindingTarget: bigint, label: string,
): Promise<void> {
  for (let iter = 0; iter < 80; iter++) {
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
  throw new Error(`${label}: mint did not reach target after 80 iterations`);
}

async function phaseMint(client: SuiClient, admin: Ed25519Keypair, n: number): Promise<void> {
  const t = totals(n);
  console.log('PHASE mint: ensuring admin balances >= totals');
  // v1 request_tokens mints NBTC (binding) + NUSDC byproduct. NBTC target drives it.
  await mintCombined(client, admin, V1_PKG, V1_FAUCET, NBTC, t.NBTC, 'v1 NBTC+NUSDC');
  // v2 request_tokens mints NETH (binding) + NSOL byproduct.
  await mintCombined(client, admin, V2_PKG, V2_FAUCET, NETH, t.NETH, 'v2 NETH+NSOL');
  // Verify all four; top up byproduct tokens with single-token faucet if short.
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
  for (const [name, tok] of Object.entries(TOKENS)) console.log(`  ${name}: ${fmt(await balance(client, tok.type), tok.dec)} (need ${fmt((t as any)[name], tok.dec)})`);
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
  console.log('PHASE merge: consolidating each token into one coin');
  for (const [name, tok] of Object.entries(TOKENS)) {
    const ids = await listCoinIds(client, tok.type); // list once; primary ID is stable across merges
    if (ids.length <= 1) { console.log(`  ${name}: already 1 coin`); continue; }
    const primary = ids[0];
    const rest = ids.slice(1);
    for (let i = 0; i < rest.length; i += MERGE_BATCH) {
      const chunk = rest.slice(i, i + MERGE_BATCH);
      const tx = new Transaction();
      tx.mergeCoins(tx.object(primary), chunk.map((id) => tx.object(id)));
      await exec(client, admin, tx, `${name} merge ${i}-${i + chunk.length}`);
      console.log(`  ${name}: merged ${Math.min(i + chunk.length, rest.length)}/${rest.length}`);
    }
    const after = await listCoinIds(client, tok.type);
    console.log(`  ${name}: consolidated (${after.length} coin, ${fmt(await balance(client, tok.type), tok.dec)})`);
  }
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
  const primaries: Record<string, string> = {};
  for (const [name, tok] of Object.entries(TOKENS)) {
    primaries[name] = await primaryCoinId(client, tok.type);
    const have = await balance(client, tok.type);
    const need = TOKENS[name].perBundle * BigInt(recips.length);
    if (have < need) throw new Error(`${name} insufficient: have ${fmt(have, tok.dec)} need ${fmt(need, tok.dec)}`);
  }
  let done = 0;
  for (let i = 0; i < recips.length; i += DIST_BATCH) {
    const batch = recips.slice(i, i + DIST_BATCH);
    const tx = new Transaction();
    const parts: Record<string, ReturnType<Transaction['splitCoins']>> = {};
    for (const [name, tok] of Object.entries(TOKENS)) {
      parts[name] = tx.splitCoins(tx.object(primaries[name]), batch.map(() => tok.perBundle));
    }
    batch.forEach((r, j) => {
      tx.transferObjects([parts.NUSDC[j], parts.NBTC[j], parts.NETH[j], parts.NSOL[j]], r.nasun);
    });
    const dig = await exec(client, admin, tx, `distribute ${i}-${i + batch.length}`);
    done += batch.length;
    console.log(`  distributed ${done}/${recips.length}  ${dig.slice(0, 10)}`);
  }
  console.log('PHASE distribute: done');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const phase = args.includes('--phase') ? args[args.indexOf('--phase') + 1] : 'all';
  const recips = loadRecipients();
  const t = totals(recips.length);

  console.log(`GP bundle airdrop - ${recips.length} recipients`);
  console.log(`  per holder: 25,000 NUSDC + 0.25 NBTC + 5 NETH + 100 NSOL`);
  console.log(`  TOTALS: NUSDC ${fmt(t.NUSDC, 6)} | NBTC ${fmt(t.NBTC, 8)} | NETH ${fmt(t.NETH, 8)} | NSOL ${fmt(t.NSOL, 9)}`);
  console.log(`  faucet calls (mint): v1 ${Math.ceil(Number(t.NBTC / NBTC.faucetPerCall))} (NBTC-bound, NUSDC byproduct ${fmt(BigInt(Math.ceil(Number(t.NBTC / NBTC.faucetPerCall))) * NUSDC.faucetPerCall, 6)}) | v2 ${Math.ceil(Number(t.NETH / NETH.faucetPerCall))} (NETH-bound, NSOL exact)`);
  console.log(`  PTB est: mint ~${Math.ceil(Number(t.NBTC / NBTC.faucetPerCall) / MINT_BATCH) + Math.ceil(Number(t.NETH / NETH.faucetPerCall) / MINT_BATCH)} + merge + distribute ${Math.ceil(recips.length / DIST_BATCH)}`);
  console.log(`  signer (creator): ${ADMIN_ADDR}`);
  if (dry) { console.log('\n[DRY RUN] no on-chain actions'); return; }

  const client = new SuiClient({ url: RPC_URL });
  const admin = loadAdmin();
  if (admin.toSuiAddress().toLowerCase() !== ADMIN_ADDR.toLowerCase()) { console.error('signer != admin'); process.exit(1); }
  const gas = Number(await balance(client, '0x2::sui::SUI')) / 1e9;
  console.log(`  admin gas: ${gas.toFixed(2)} NASUN\n`);
  if (gas < 5) { console.error('admin gas too low'); process.exit(1); }

  if (phase === 'all' || phase === 'mint') await phaseMint(client, admin, recips.length);
  if (phase === 'all' || phase === 'merge') await phaseMerge(client, admin);
  if (phase === 'all' || phase === 'distribute') await phaseDistribute(client, admin, recips);
  console.log('\nAirdrop complete.');
}
main().catch((e) => { console.error('Fatal:', e instanceof Error ? e.message : e); process.exit(1); });
