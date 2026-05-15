// PR2.A — 7-day grace cron + boot catch-up.
//
// SSM Parameter Store has no native recovery window, so we model one
// here: DELETE soft-deletes the row (deleted_at = now), and this cron
// hard-deletes both the SSM Parameter and the row only when the grace
// window has fully elapsed.
//
// Boot catch-up: chat-server restart could leave deleted_at + 7d < now
// rows lingering. startVaultPurgeCron() runs the purge once at startup
// before scheduling the hourly tick.

import {
  SSMClient,
  DeleteParameterCommand,
} from '@aws-sdk/client-ssm';
import { getDb } from './store.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

let ssmClient: SSMClient | null = null;
function getSsm(): SSMClient {
  if (!ssmClient) {
    ssmClient = new SSMClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });
  }
  return ssmClient;
}

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
    `SELECT param_name, agent_address FROM agent_keys
     WHERE deleted_at IS NOT NULL AND deleted_at < ?`
  ).all(cutoff) as { param_name: string; agent_address: string }[];

  for (const row of rows) {
    try {
      await getSsm().send(new DeleteParameterCommand({ Name: row.param_name }));
      getDb().prepare(`DELETE FROM agent_keys WHERE agent_address = ?`)
        .run(row.agent_address);
      console.log(`[vault-purge] purged ${row.agent_address}`);
    } catch (err) {
      const errName = (err as { name?: string }).name;
      if (errName === 'ParameterNotFound') {
        // Already gone (manual aws cli or earlier failed cleanup) — drop the row.
        getDb().prepare(`DELETE FROM agent_keys WHERE agent_address = ?`)
          .run(row.agent_address);
        console.log(`[vault-purge] orphan SQLite row reaped: ${row.agent_address}`);
        continue;
      }
      console.error(`[vault-purge] failed ${row.agent_address}: ${errName ?? (err as Error).message}`);
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
