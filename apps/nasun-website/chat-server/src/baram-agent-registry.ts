// Baram agent endpoint registry (Plan D §D-2 §A3).
//
// agent-runner instances register their /wake HTTP URL via a POST heartbeat
// every 60 seconds. The Telegram webhook handler looks up the endpoint for the
// agent address stored in a baram_session row, then forwards /wake calls there.
//
// Table: baram_agent_endpoints(agent TEXT PK, http_url TEXT NOT NULL, last_seen INTEGER NOT NULL)
// Added to the DB in store.ts initStore().

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getDb } from './store.js';

const STALE_THRESHOLD_MS = 90_000; // 90s — 1.5x the 60s heartbeat cadence

interface RawEndpointRow {
  agent: string;
  http_url: string;
  last_seen: number;
  budget_id: string | null;
}

export interface AgentEndpoint {
  agent: string;
  httpUrl: string;
  lastSeen: number;
  budgetId: string | null;
}

function rowToEndpoint(row: RawEndpointRow): AgentEndpoint {
  return {
    agent: row.agent,
    httpUrl: row.http_url,
    lastSeen: row.last_seen,
    budgetId: row.budget_id,
  };
}

export function upsertEndpoint(agent: string, httpUrl: string, budgetId: string | null = null): void {
  getDb()
    .prepare(
      `INSERT INTO baram_agent_endpoints (agent, http_url, last_seen, budget_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(agent) DO UPDATE SET http_url = excluded.http_url,
                                        last_seen = excluded.last_seen,
                                        budget_id = COALESCE(excluded.budget_id, budget_id)`,
    )
    .run(agent.toLowerCase(), httpUrl, Date.now(), budgetId);
}

export function getEndpoint(agent: string): AgentEndpoint | null {
  const row = getDb()
    .prepare(`SELECT agent, http_url, last_seen, budget_id FROM baram_agent_endpoints WHERE agent = ?`)
    .get(agent.toLowerCase()) as RawEndpointRow | undefined;
  return row ? rowToEndpoint(row) : null;
}

export function isEndpointFresh(ep: AgentEndpoint, nowMs = Date.now()): boolean {
  return nowMs - ep.lastSeen < STALE_THRESHOLD_MS;
}

export function pruneStaleEndpoints(): number {
  const cutoff = Date.now() - STALE_THRESHOLD_MS * 4; // 6-minute hard cutoff
  const result = getDb()
    .prepare(`DELETE FROM baram_agent_endpoints WHERE last_seen < ?`)
    .run(cutoff);
  return result.changes;
}

// === Heartbeat route handler ===

const MAX_HEARTBEAT_BODY = 2048;

function getHmacSecret(): Buffer {
  const raw = process.env.BARAM_CHAT_SERVER_HMAC_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('BARAM_CHAT_SERVER_HMAC_SECRET missing or too short');
  }
  return Buffer.from(raw, 'hex');
}

function verifyHmac(body: Buffer, header: string): boolean {
  try {
    const expected = createHmac('sha256', getHmacSecret()).update(body).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(header.slice(0, expected.length * 2), 'hex');
    if (providedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(providedBuf, expectedBuf);
  } catch {
    return false;
  }
}

async function readBody(req: import('node:http').IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_HEARTBEAT_BODY) { req.destroy(); reject(new Error('body_too_large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Handle POST /api/baram/agent/heartbeat.
 * Body: { agent: "0x...", http_url: "http://127.0.0.1:4400" }
 * Auth: X-HMAC header (HMAC-SHA256 of body, hex, using BARAM_CHAT_SERVER_HMAC_SECRET).
 */
export async function handleHeartbeat(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  let body: Buffer;
  try {
    body = await readBody(req);
  } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    res.writeHead(code, corsHeaders);
    res.end(JSON.stringify({ error: (err as Error).message }));
    return;
  }

  const hmacHeader = req.headers['x-hmac'];
  if (typeof hmacHeader !== 'string' || !verifyHmac(body, hmacHeader)) {
    res.writeHead(401, corsHeaders);
    res.end(JSON.stringify({ error: 'bad_hmac' }));
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
  } catch {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'invalid_json' }));
    return;
  }

  const agent = typeof parsed.agent === 'string' ? parsed.agent : null;
  const httpUrl = typeof parsed.http_url === 'string' ? parsed.http_url : null;
  const budgetId = typeof parsed.budget_id === 'string' ? parsed.budget_id : null;

  if (!agent || !/^0x[0-9a-fA-F]{40,64}$/.test(agent)) {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'invalid_agent' }));
    return;
  }
  if (!httpUrl || !httpUrl.startsWith('http://127.0.0.1:')) {
    // Restrict to loopback URLs only — agent-runner must be local.
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'invalid_http_url' }));
    return;
  }
  if (budgetId !== null && !/^0x[0-9a-fA-F]{40,64}$/.test(budgetId)) {
    res.writeHead(400, corsHeaders);
    res.end(JSON.stringify({ error: 'invalid_budget_id' }));
    return;
  }

  upsertEndpoint(agent, httpUrl, budgetId);
  res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, last_seen: Date.now() }));
}
