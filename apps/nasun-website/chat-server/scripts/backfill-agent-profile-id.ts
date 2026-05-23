// Phase 8 (2026-05-24) — one-shot backfill of agent_keys.profile_id.
//
// The profile_id column was added in store.ts:271 (AER v3) but rows
// created before the upload path started populating it remain NULL. Phase 8
// reconcile uses profile_id to read on-chain AgentProfile.is_active; rows
// with NULL profile_id are stuck in 'unknown' state.
//
// This script:
//   1. SELECTs every active (deleted_at IS NULL) agent_keys row with profile_id NULL
//   2. For each row, calls getOwnedObjects(wallet, StructType=AgentProfile)
//      and matches the entry whose fields.agent_address == row.agent_address
//   3. UPDATEs the row with the resolved profile_id (dry-run by default)
//
// Usage:
//   RPC_URL=https://rpc.devnet.nasun.io \
//   AGENT_ORIGINAL_PACKAGE_ID=0x15b5c... \
//   DB_PATH=/home/ec2-user/nasun-chat-server/data/chat.db \
//   pnpm tsx scripts/backfill-agent-profile-id.ts            # dry-run
//   pnpm tsx scripts/backfill-agent-profile-id.ts --execute  # writes
//
// Idempotent: re-running after partial success skips already-filled rows.

import Database from 'better-sqlite3';
import { SuiClient } from '@mysten/sui/client';

const RPC_URL = process.env.RPC_URL ?? 'https://rpc.devnet.nasun.io';
const ORIG_PKG = need('AGENT_ORIGINAL_PACKAGE_ID');
const DB_PATH = need('DB_PATH');
const EXECUTE = process.argv.includes('--execute');

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env: ${name}`);
    process.exit(1);
  }
  return v;
}

interface KeyRow {
  agent_address: string;
  wallet_address: string;
}

async function main(): Promise<void> {
  const db = new Database(DB_PATH, { readonly: !EXECUTE });
  // chat-server uses WAL and holds long write txns during aggregator cycles;
  // give SQLite 5s to wait out a conflicting writer before failing.
  db.pragma('busy_timeout = 5000');
  const rows = db.prepare(
    `SELECT agent_address, wallet_address FROM agent_keys
      WHERE profile_id IS NULL AND deleted_at IS NULL`,
  ).all() as KeyRow[];

  console.log(`Found ${rows.length} active rows with NULL profile_id`);
  if (rows.length === 0) {
    db.close();
    return;
  }

  const client = new SuiClient({ url: RPC_URL });
  const structType = `${ORIG_PKG}::agent_profile::AgentProfile`;

  const updateStmt = db.prepare(
    `UPDATE agent_keys SET profile_id = ? WHERE agent_address = ? AND profile_id IS NULL`,
  );

  const resolved: { agent: string; profileId: string }[] = [];
  const unresolved: KeyRow[] = [];

  for (const row of rows) {
    try {
      const res = await client.getOwnedObjects({
        owner: row.wallet_address,
        filter: { StructType: structType },
        options: { showContent: true },
        limit: 50,
      });
      if (res.hasNextPage) {
        console.warn(
          `  WARNING: ${row.wallet_address} owns >50 AgentProfile objects; pagination not yet supported. Manual review required if no match below.`,
        );
      }
      const match = res.data.find((o) => {
        const fields = (o.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
        const agentField = String(fields?.agent_address ?? '').toLowerCase();
        return agentField === row.agent_address.toLowerCase();
      });
      if (match?.data?.objectId) {
        resolved.push({ agent: row.agent_address, profileId: match.data.objectId });
      } else {
        unresolved.push(row);
      }
    } catch (err) {
      console.warn(`  RPC error for ${row.agent_address}:`, (err as Error).message);
      unresolved.push(row);
    }
  }

  console.log(`\nResolved: ${resolved.length}`);
  for (const r of resolved) {
    console.log(`  ${r.agent} → ${r.profileId}`);
  }
  if (unresolved.length > 0) {
    console.log(`\nUnresolved (need manual review): ${unresolved.length}`);
    for (const r of unresolved) {
      console.log(`  ${r.agent} (wallet ${r.wallet_address})`);
    }
  }

  if (!EXECUTE) {
    console.log('\nDry-run. Re-run with --execute to write.');
    db.close();
    return;
  }

  let updated = 0;
  for (const r of resolved) {
    const info = updateStmt.run(r.profileId, r.agent);
    updated += info.changes;
  }
  console.log(`\nUpdated ${updated} rows.`);
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
