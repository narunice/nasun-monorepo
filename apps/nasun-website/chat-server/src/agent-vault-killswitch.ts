// PR2.A — Emergency kill switch.
//
// Custody is a directory of key files on this host (agent-vault-store.ts), so
// there is no provider-side revocation to reach for in an incident. Instead,
// chat-server exposes a kill switch that:
//   1. Stops every nasun-ai-agent-* PM2 process (orchestrator's prefix
//      guard ensures co-located bots are unaffected).
//   2. Soft-deletes every active agent_keys row.
//   3. Forces an immediate purge — unlinks every stored secret and drops the
//      tombstone rows, bypassing the 7-day grace window.
//   4. Clears baram_agent_endpoints so /wake routing breaks instantly.
//
// This action is intentionally destructive: an unlinked key file has no
// undelete, and no backup job covers the vault. Caller must confirm
// explicitly.

import { getDb } from './store.js';
import { getRunningAgents, stopAgentPm2 } from './agent-orchestrator.js';
import { runVaultPurge } from './agent-vault-purge.js';

export async function triggerKillSwitch(reason: string): Promise<{
  stoppedProcesses: string[];
  affectedAgents: number;
}> {
  console.warn(`[KILL-SWITCH] triggered: ${reason}`);

  // 1. Stop every nasun-ai-agent-* PM2 process. orchestrator.assertSafeName
  //    guarantees the prefix; co-located pado-bots / lp-bot-* / chat-server
  //    itself are untouched.
  const running = await getRunningAgents();
  const stopped: string[] = [];
  for (const name of running) {
    try {
      await stopAgentPm2(name);
      stopped.push(name);
    } catch (err) {
      console.error(`[KILL-SWITCH] stop ${name} failed: ${(err as Error).message}`);
    }
  }

  // 2. Soft-delete every still-active row.
  const now = Date.now();
  const updateRes = getDb()
    .prepare(`UPDATE agent_keys SET deleted_at = ? WHERE deleted_at IS NULL`)
    .run(now);
  const affectedAgents = updateRes.changes;

  // 3. Forced purge: SSM DeleteParameter on every soft-deleted row right now.
  await runVaultPurge(true);

  // 4. Clear endpoints so chat routing instantly breaks.
  getDb().prepare(`DELETE FROM baram_agent_endpoints`).run();

  console.warn(`[KILL-SWITCH] complete — stopped ${stopped.length} processes, soft-deleted ${affectedAgents} rows`);
  return { stoppedProcesses: stopped, affectedAgents };
}
