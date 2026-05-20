/**
 * One-shot admin cancel for the 3 sports markets we reissued on 2026-05-19.
 *
 * Why: the original sports markets shipped with `Will <home> beat <away>?`
 * questions that omitted sport + league context, making the market list
 * unreadable to anyone who didn't already know the fixtures. `question` is
 * onchain-immutable, so we minted three replacement markets with the
 * `⚽ <League> — Will ...` prefix (see create-sports-batch.ts) and call
 * admin_cancel_market on the originals here.
 *
 * Safe: all three originals had TokensMinted=0 (verified 2026-05-19
 * pre-cancel), so no user funds are stranded. prediction-lp's bootstrap
 * inventory is the only outstanding share supply; cancel triggers the
 * standard refund flow on next claim.
 *
 * Required env:
 *   PREDICTION_ADMIN_KEY   creator wallet (must own AdminCap)
 *   PREDICTION_PACKAGE_ID  current package id (Move call target)
 *   PREDICTION_ADMIN_CAP   optional, defaulted
 *
 * Usage:
 *   node --env-file=apps/pado/bots/.env --import tsx \
 *     apps/pado/bots/scripts/admin-cancel-sports-reissue.ts --dry-run
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0x06f263829f9f84951280e2fa16d32d2729c28aca2600e4e77ec54a86d00f8fa1';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;

// Original 3 sports markets created 2026-05-18 with team-name-only questions.
// IDs are upgrade-stable owned-object ids; same regardless of which package
// variant we call admin_cancel_market on.
const TARGETS = [
  {
    id: '0x169b0f98c542bda85e7f5cbece8c3d5598ecedc34ca6da90ddadafb73940a305',
    label: 'Liverpool vs Brentford (legacy)',
  },
  {
    id: '0x72a685f7e7b5d34f2e6e1f84c2276f33e584128e6bf8246c0c404234b508c0a9',
    label: 'Manchester City vs Aston Villa (legacy)',
  },
  {
    id: '0xa552f5823975f1fa84e5390a78eae5fb2f30e0490d0aeb4b1191f89673ddfd17',
    label: 'Paris Saint-Germain vs Arsenal (legacy)',
  },
] as const;

function parseKeypair(s: string): Ed25519Keypair {
  if (s.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(s);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  const clean = s.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error('bad privkey');
  return Ed25519Keypair.fromSecretKey(Buffer.from(clean, 'hex'));
}

function requireEnv(n: string): string {
  const v = process.env[n];
  if (!v) { console.error(`${n} required`); process.exit(1); }
  return v;
}

function requireHex64(n: string, v: string): string {
  if (!HEX_64.test(v)) { console.error(`${n} must be 0x-32-byte hex`); process.exit(1); }
  return v.toLowerCase();
}

async function cancel(
  client: SuiClient, admin: Ed25519Keypair, packageId: string, cap: string, marketId: string,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${packageId}::prediction_market::admin_cancel_market`,
        arguments: [tx.object(cap), tx.object(marketId), tx.object(CLOCK_ID)],
      });
      const r = await client.signAndExecuteTransaction({
        signer: admin, transaction: tx, options: { showEffects: true },
      });
      if (r.effects?.status?.status !== 'success') {
        throw new Error(`TX failed: ${r.effects?.status?.error ?? '?'}`);
      }
      await client.waitForTransaction({ digest: r.digest });
      return r.digest;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retriable = /not available for consumption|current version|ObjectVersionUnavailable|already locked|reference is not available|EquivocationDetected|HTTP (?:429|5\d\d)|fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i.test(msg);
      if (!retriable || attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw lastErr;
}

async function statusOf(client: SuiClient, id: string): Promise<{ status: number; question: string } | null> {
  const obj = await client.getObject({ id, options: { showContent: true } });
  const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
  if (!fields) return null;
  return {
    status: Number(fields.status ?? -1),
    question: String(fields.question ?? ''),
  };
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run');
  const admin = parseKeypair(requireEnv('PREDICTION_ADMIN_KEY'));
  const packageId = requireHex64('PREDICTION_PACKAGE_ID', requireEnv('PREDICTION_PACKAGE_ID'));
  const cap = requireHex64('PREDICTION_ADMIN_CAP', process.env.PREDICTION_ADMIN_CAP || DEFAULT_ADMIN_CAP);
  const client = new SuiClient({ url: RPC_URL });

  const capObj = await client.getObject({ id: cap, options: { showOwner: true } });
  const capOwner = (capObj.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (capOwner?.toLowerCase() !== admin.toSuiAddress().toLowerCase()) {
    console.error(`AdminCap not owned by admin (${capOwner})`);
    process.exit(1);
  }

  for (const t of TARGETS) {
    const s = await statusOf(client, t.id);
    if (!s) { console.log(`${t.label} [${t.id}] — NOT FOUND, skipping`); continue; }
    console.log(`${t.label} [${t.id}]`);
    console.log(`  question: ${s.question}`);
    console.log(`  status:   ${s.status} (0=OPEN, 1=CLOSED, 2=RESOLVED, 3=CANCELLED)`);
    if (s.status === 2 || s.status === 3) {
      console.log(`  -> already resolved/cancelled, skipping`);
      continue;
    }
    if (dry) {
      console.log(`  -> [DRY RUN] would admin_cancel_market`);
      continue;
    }
    process.stdout.write(`  -> admin_cancel_market... `);
    try {
      const digest = await cancel(client, admin, packageId, cap, t.id);
      console.log(digest);
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
