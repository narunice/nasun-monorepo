// PR2.A — 7-day grace cron + boot catch-up.
//
// The keypair store has no native recovery window, so we model one here:
// DELETE soft-deletes the row (deleted_at = now), and this cron hard-deletes
// both the stored secret and the row only when the grace window has fully
// elapsed.
//
// Boot catch-up: chat-server restart could leave deleted_at + 7d < now
// rows lingering. startVaultPurgeCron() runs the purge once at startup
// before scheduling the hourly tick.
//
// Custody moved from SSM Parameter Store to the box (agent-vault-store.ts), so
// the AGENT_VAULT_RETIRED branch that skipped the remote delete is gone: a
// local unlink has no account left to fail against, and skipping it would now
// leak private keys that outlive their rows.

import { getDb } from './store.js';
import { deleteSecret } from './agent-vault-store.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

let lastRunAt = 0;

export function getLastVaultPurgeRun(): number {
  return lastRunAt;
}

/**
 * @param forceImmediate when true (kill-switch path), purge ALL soft-deleted
 *   rows regardless of grace window. Default false: only rows past 7-day grace.
 */
export async function runVaultPurge(forceImmediate = false): Promise<void> {
  lastRunAt = Date.now();
  const cutoff = forceImmediate ? Date.now() + 1 : Date.now() - SEVEN_DAYS_MS;
  const rows = getDb().prepare(
    `SELECT agent_address FROM agent_keys
     WHERE deleted_at IS NOT NULL AND deleted_at < ?`
  ).all(cutoff) as { agent_address: string }[];

  for (const row of rows) {
    try {
      // deleteSecret is idempotent: false means it was already gone (an earlier
      // failed cleanup, or a pre-exit row whose secret only ever lived in the
      // retired SSM account). Either way the row is safe to reap -- what must
      // never happen is reaping the row while a readable secret survives it.
      const removed = await deleteSecret(row.agent_address);
      getDb().prepare(`DELETE FROM agent_keys WHERE agent_address = ?`)
        .run(row.agent_address);
      console.log(
        removed
          ? `[vault-purge] purged ${row.agent_address}`
          : `[vault-purge] no stored secret; row reaped: ${row.agent_address}`,
      );
    } catch (err) {
      console.error(
        `[vault-purge] failed ${row.agent_address}: `
        + `${(err as { name?: string }).name ?? (err as Error).message}`,
      );
    }
  }
}

/** Schedule the hourly purge + run once at boot for catch-up. */
export function startVaultPurgeCron(): void {
  void runVaultPurge().catch(err => {
    console.error('[vault-purge] boot catch-up failed:', err);
  });
  setInterval(() => {
    void runVaultPurge().catch(err => {
      console.error('[vault-purge] tick failed:', err);
    });
  }, PURGE_INTERVAL_MS).unref();
}
