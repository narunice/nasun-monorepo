// Nasun AI trader config REST endpoints.
//
// POST /api/nasun-ai/config
//   Body: { agentAddress, walletAddress, config }
//   Stores the browser-saved TraderConfig so the runtime can read it.
//   No wallet-sig auth — devnet prototype; configs have no financial value on their own.
//
// GET /api/nasun-ai/config/:agentAddress
//   HMAC auth (X-HMAC header, same secret as heartbeat).
//   Returns the stored config JSON for the given agent.
//   Used by nasun-ai-runtime at cycle start.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { getDb } from './store.js';
import { isValidSuiAddress } from './auth.js';

const MAX_BODY_BYTES = 32 * 1024;
const AGENT_RE = /^0x[0-9a-fA-F]{40,64}$/;

interface RawConfigRow {
  agent_address: string;
  wallet_address: string;
  config_json: string;
  updated_at: number;
}

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
      if (size > MAX_BODY_BYTES) { req.destroy(); reject(new Error('body_too_large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function upsertConfig(agentAddress: string, walletAddress: string, configJson: string): void {
  getDb()
    .prepare(
      `INSERT INTO nasun_ai_trader_configs (agent_address, wallet_address, config_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(agent_address) DO UPDATE SET
         wallet_address = excluded.wallet_address,
         config_json    = excluded.config_json,
         updated_at     = excluded.updated_at`,
    )
    .run(agentAddress.toLowerCase(), walletAddress.toLowerCase(), configJson, Date.now());
}

function deleteConfig(agentAddress: string): void {
  getDb()
    .prepare(`DELETE FROM nasun_ai_trader_configs WHERE agent_address = ?`)
    .run(agentAddress.toLowerCase());
}

function getConfig(agentAddress: string): RawConfigRow | null {
  return (
    getDb()
      .prepare(`SELECT agent_address, wallet_address, config_json, updated_at FROM nasun_ai_trader_configs WHERE agent_address = ?`)
      .get(agentAddress.toLowerCase()) as RawConfigRow | undefined
  ) ?? null;
}

export async function handleNasunAiConfigRequest(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  url: URL,
  corsHeaders: Record<string, string>,
): Promise<boolean> {
  const pathname = url.pathname;

  // POST /api/nasun-ai/config — browser saves trader config
  if (pathname === '/api/nasun-ai/config' && req.method === 'POST') {
    const postCors = {
      ...corsHeaders,
      'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    let body: Buffer;
    try {
      body = await readBody(req);
    } catch (err) {
      const code = (err as Error).message === 'body_too_large' ? 413 : 400;
      res.writeHead(code, postCors);
      res.end(JSON.stringify({ error: (err as Error).message }));
      return true;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
    } catch {
      res.writeHead(400, postCors);
      res.end(JSON.stringify({ error: 'invalid_json' }));
      return true;
    }

    const agentAddress = typeof parsed.agentAddress === 'string' ? parsed.agentAddress : null;
    const walletAddress = typeof parsed.walletAddress === 'string' ? parsed.walletAddress : null;
    const config = parsed.config;

    if (!agentAddress || !AGENT_RE.test(agentAddress)) {
      res.writeHead(400, postCors);
      res.end(JSON.stringify({ error: 'invalid_agent_address' }));
      return true;
    }
    if (!walletAddress || !isValidSuiAddress(walletAddress)) {
      res.writeHead(400, postCors);
      res.end(JSON.stringify({ error: 'invalid_wallet_address' }));
      return true;
    }
    if (config === undefined || config === null || typeof config !== 'object') {
      res.writeHead(400, postCors);
      res.end(JSON.stringify({ error: 'missing_config' }));
      return true;
    }

    let configJson: string;
    try {
      configJson = JSON.stringify(config);
      if (configJson.length > MAX_BODY_BYTES) throw new Error('config_too_large');
    } catch (err) {
      res.writeHead(400, postCors);
      res.end(JSON.stringify({ error: (err as Error).message }));
      return true;
    }

    upsertConfig(agentAddress, walletAddress, configJson);
    res.writeHead(200, { ...postCors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  // DELETE /api/nasun-ai/config — browser deletes trader config
  if (pathname === '/api/nasun-ai/config' && req.method === 'DELETE') {
    const deleteCors = {
      ...corsHeaders,
      'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    let body: Buffer;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, deleteCors);
      res.end(JSON.stringify({ error: 'bad_request' }));
      return true;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
    } catch {
      res.writeHead(400, deleteCors);
      res.end(JSON.stringify({ error: 'invalid_json' }));
      return true;
    }
    const agentAddress = typeof parsed.agentAddress === 'string' ? parsed.agentAddress : null;
    if (!agentAddress || !AGENT_RE.test(agentAddress)) {
      res.writeHead(400, deleteCors);
      res.end(JSON.stringify({ error: 'invalid_agent_address' }));
      return true;
    }
    deleteConfig(agentAddress);
    res.writeHead(200, { ...deleteCors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  // OPTIONS /api/nasun-ai/config
  if (pathname === '/api/nasun-ai/config' && req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...corsHeaders,
      'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return true;
  }

  // GET /api/nasun-ai/config/:agentAddress — runtime reads trader config (HMAC auth)
  const getMatch = pathname.match(/^\/api\/nasun-ai\/config\/([^/]+)$/);
  if (getMatch && req.method === 'GET') {
    const agentAddress = getMatch[1];
    if (!agentAddress || !AGENT_RE.test(agentAddress)) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'invalid_agent_address' }));
      return true;
    }

    const hmacHeader = req.headers['x-hmac'];
    if (typeof hmacHeader !== 'string') {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: 'missing_hmac' }));
      return true;
    }
    // For GET, HMAC is computed over the agent address (no body)
    const agentBuf = Buffer.from(agentAddress.toLowerCase(), 'utf8');
    if (!verifyHmac(agentBuf, hmacHeader)) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: 'bad_hmac' }));
      return true;
    }

    const row = getConfig(agentAddress);
    if (!row) {
      res.writeHead(404, corsHeaders);
      res.end(JSON.stringify({ error: 'not_found' }));
      return true;
    }

    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ config: JSON.parse(row.config_json), updatedAt: row.updated_at }));
    return true;
  }

  return false;
}
