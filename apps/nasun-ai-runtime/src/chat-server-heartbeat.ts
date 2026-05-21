/**
 * chat-server agent registration heartbeat (Plan D D-2).
 *
 * Why this is a separate file:
 *   The HMAC envelope (X-Timestamp + body, hex-canonicalised) is
 *   security-sensitive — extracting it makes the contract visible at
 *   a glance and the chat-server side is mirrored 1-1. Burying the
 *   construction inside main() in index.ts hid it during the PR2.A
 *   review.
 *
 * Why every 60s and immediate first ping:
 *   chat-server's agent-orchestrator times out an agent record at
 *   ~120s of silence and refuses to forward /wake requests to it.
 *   60s gives us one missed-ping budget. The immediate ping makes
 *   the agent visible without waiting a full interval after a
 *   restart — important on PM2 reload where users might hit /wake
 *   within the first few seconds.
 *
 * Why HMAC + X-Timestamp (not just HMAC of body):
 *   The timestamp binds a request to a moment in time so a captured
 *   payload can't be replayed days later. chat-server validates the
 *   timestamp window before accepting. Canonicalised input is
 *   `${ts}\n${hex(body)}` — chat-server side matches exactly.
 *
 * Why `BARAM_CHAT_SERVER_HMAC_SECRET` (env name keeps Baram prefix):
 *   onchain `baram::*` Move module is invariant; the secret is shared
 *   with chat-server which also keeps Baram-prefixed env names. User-
 *   facing branding is "Nasun AI", but internal env identifiers stay
 *   stable to avoid a coordinated rename across two services for a
 *   purely cosmetic change.
 *
 * Failure mode: missing secret -> no heartbeat, no error. The caller
 * still logs that it intended to register; chat-server will simply
 * never see this agent. This is deliberate: dev environments often
 * omit the secret on purpose, and crashing the agent over a missing
 * heartbeat would block local debugging of the cycle loop itself.
 */

import { createHmac } from 'node:crypto';

import { log } from './logger.js';

export interface ChatServerHeartbeatOptions {
  chatServerBaseUrl: string;
  agentAddress: string;
  budgetId: string;
  wakePort: number;
}

/**
 * Start the chat-server registration heartbeat. The returned timer is
 * `unref()`ed so it never blocks process exit. Returns null when the
 * HMAC secret is missing (no heartbeat is scheduled).
 */
export function startChatServerHeartbeat(opts: ChatServerHeartbeatOptions): ReturnType<typeof setInterval> | null {
  const hmacSecret = process.env.BARAM_CHAT_SERVER_HMAC_SECRET;
  if (!hmacSecret) return null;

  const wakeHttpUrl = `http://127.0.0.1:${opts.wakePort}`;
  const heartbeatUrl = `${opts.chatServerBaseUrl}/api/nasun-ai/agent/heartbeat`;

  const sendHeartbeat = (): void => {
    const body = JSON.stringify({
      agent: opts.agentAddress,
      http_url: wakeHttpUrl,
      budget_id: opts.budgetId,
    });
    // PR2.A: HMAC binds X-Timestamp + body to prevent replay. Input
    // canonicalization is `${ts}\n${hex(body)}` — chat-server matches.
    const ts = String(Date.now());
    const bodyBuf = Buffer.from(body, 'utf8');
    const hmacInput = Buffer.concat([
      Buffer.from(ts + '\n', 'utf8'),
      Buffer.from(bodyBuf.toString('hex'), 'utf8'),
    ]);
    const hmac = createHmac('sha256', Buffer.from(hmacSecret, 'hex'))
      .update(hmacInput).digest('hex');
    fetch(heartbeatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HMAC': hmac,
        'X-Timestamp': ts,
        'Connection': 'close',
      },
      body,
      signal: AbortSignal.timeout(15_000),
    }).then((r) => {
      if (!r.ok) log(`[heartbeat] registration rejected: HTTP ${r.status}`);
    }).catch((err: Error) => log(`[heartbeat] registration failed: ${err.message}`));
  };

  sendHeartbeat(); // immediate first ping
  const heartbeatTimer = setInterval(sendHeartbeat, 60_000);
  heartbeatTimer.unref(); // don't block process exit
  log(`[heartbeat] Registering ${wakeHttpUrl} with ${heartbeatUrl} every 60s`);
  return heartbeatTimer;
}
