// Nasun AI trader config REST endpoints.
//
// POST /api/nasun-ai/config
//   Body: { agentAddress, walletAddress, config, ts, signature }
//   Wallet-sig auth: `signature` MUST be a Sui personal-message signature
//   over the canonical bytes
//     `nasun-ai-config:save:v1:${walletLower}:${agentLower}:${configHashHex}:${ts}`
//   issued by `walletAddress`. The recovered address must equal
//   `walletAddress`, `ts` must be within +/-5 minutes of server time, and the
//   first writer for an `agentAddress` claims ownership — subsequent writes
//   from a different `walletAddress` are rejected with 403.
//
// DELETE /api/nasun-ai/config
//   Body: { agentAddress, walletAddress, ts, signature }
//   Canonical: `nasun-ai-config:delete:v1:${walletLower}:${agentLower}:${ts}`.
//   Same checks as POST, plus the stored row's walletAddress must match.
//
// GET /api/nasun-ai/config/:agentAddress
//   Two modes, branched on `X-HMAC` header:
//     - With X-HMAC: runtime path. Header is HMAC-SHA256(secret, agentAddress lowercased).
//       Used by nasun-ai-runtime at cycle start (self-config gate).
//     - Without X-HMAC: browser path. No auth; IP rate-limited.
//       Stored configs are operational metadata (wallet, agent, strategy,
//       limits) derived from on-chain capability/escrow/AgentProfile —
//       no secrets. The IP rate-limit prevents enumeration scraping.
//   Returns the stored config JSON for the given agent.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { SuiClient } from '@mysten/sui/client';
import { getDb } from './store.js';
import { isValidSuiAddress } from './auth.js';
import {
  reconcileAgentState,
  readAgentStateSnapshot,
  type AgentStateResult,
} from './agent-orchestrator.js';

const MAX_BODY_BYTES = 32 * 1024;
const AGENT_RE = /^0x[0-9a-fA-F]{40,64}$/;
const TS_SKEW_MS = 5 * 60 * 1000;

// Browser-side GET rate limit. Settings/Quickstart open once a session
// then occasional refreshes; 60/min/IP is generous for normal use and
// still blocks naïve enumeration.
//
// Bucket map has a soft cap to prevent unbounded growth under an IP-
// rotation scrape attempt. When the map exceeds RATE_BUCKET_SOFT_CAP,
// the next request triggers a sweep that drops expired entries; if the
// map is still over cap after sweeping, the oldest-by-resetAt entries
// are evicted. Eviction loses rate-limit memory for that IP, which is
// acceptable: the worst case is a long-tail attacker spreading 60 req/min
// over many IPs, which is already bounded by network reality.
const BROWSER_GET_RATE_LIMIT_PER_IP_PER_MINUTE = 60;
const RATE_BUCKET_SOFT_CAP = 50_000;
const browserGetBuckets = new Map<string, { count: number; resetAt: number }>();
function sweepBuckets(now: number): void {
  for (const [k, v] of browserGetBuckets) {
    if (v.resetAt < now) browserGetBuckets.delete(k);
  }
  if (browserGetBuckets.size > RATE_BUCKET_SOFT_CAP) {
    // Still too big after expiry sweep: drop oldest-by-resetAt until under cap.
    const sorted = [...browserGetBuckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    const dropCount = browserGetBuckets.size - RATE_BUCKET_SOFT_CAP;
    for (let i = 0; i < dropCount; i++) browserGetBuckets.delete(sorted[i][0]);
  }
}
function browserGetRateLimit(ip: string): boolean {
  const now = Date.now();
  if (browserGetBuckets.size > RATE_BUCKET_SOFT_CAP) sweepBuckets(now);
  const bucket = browserGetBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    browserGetBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= BROWSER_GET_RATE_LIMIT_PER_IP_PER_MINUTE) return false;
  bucket.count += 1;
  return true;
}

// Global QPS cap on the public GET /state endpoint. Per-IP rate-limit is
// the first line of defense, but distributed scanning (botnet / NAT
// rotation) can bypass it. The endpoint reads on-chain via a 10s TTL
// cache so the worst-case load is bounded, but we add a coarse global cap
// to keep chat-server's main loop from spending all its time on enumeration
// scrapes. 600 req/min ≈ 10 QPS — generous for a healthy fleet of N≤99
// agents polling once every 30s.
const STATE_GLOBAL_QPS_PER_MINUTE = 600;
let stateGlobalCount = 0;
let stateGlobalResetAt = 0;
function stateGlobalRateLimit(): boolean {
  const now = Date.now();
  if (stateGlobalResetAt < now) {
    stateGlobalCount = 1;
    stateGlobalResetAt = now + 60_000;
    return true;
  }
  if (stateGlobalCount >= STATE_GLOBAL_QPS_PER_MINUTE) return false;
  stateGlobalCount += 1;
  return true;
}
function clientIp(req: import('node:http').IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  const first = Array.isArray(xff) ? xff[0] : xff?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

// 32 bytes encoded as hex = 64 chars. Tightened from the previous
// length-on-hex-chars check that accepted 16-byte keys.
const MIN_HMAC_HEX_LEN = 64;

interface RawConfigRow {
  agent_address: string;
  wallet_address: string;
  config_json: string;
  updated_at: number;
}

// Shared SuiClient for zkLogin signature verification (epoch + JWK fetch).
let zkLoginClient: SuiClient | null = null;
function getZkLoginClient(): SuiClient {
  if (!zkLoginClient) {
    zkLoginClient = new SuiClient({
      url: process.env.RPC_URL || 'https://rpc.devnet.nasun.io',
    });
  }
  return zkLoginClient;
}

function getHmacSecret(): Buffer {
  const raw = process.env.BARAM_CHAT_SERVER_HMAC_SECRET;
  if (!raw || raw.length < MIN_HMAC_HEX_LEN) {
    throw new Error('BARAM_CHAT_SERVER_HMAC_SECRET missing or too short (need >= 32 bytes hex)');
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

function deleteConfigRow(agentAddress: string): void {
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

function existingOwner(agentAddress: string): string | null {
  const row = getConfig(agentAddress);
  return row?.wallet_address ?? null;
}

export function getAgentNameByAddress(agentAddress: string): string | null {
  const row = getConfig(agentAddress);
  if (!row) return null;
  try {
    const cfg = JSON.parse(row.config_json) as Record<string, unknown>;
    const name = cfg.name;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function isFreshTs(ts: unknown): ts is number {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return false;
  const skew = Math.abs(Date.now() - ts);
  return skew <= TS_SKEW_MS;
}

async function verifyWalletSig(
  message: string,
  signature: string,
  expectedWallet: string,
): Promise<boolean> {
  try {
    const bytes = new TextEncoder().encode(message);
    const publicKey = await verifyPersonalMessageSignature(bytes, signature, {
      client: getZkLoginClient(),
    });
    return publicKey.toSuiAddress().toLowerCase() === expectedWallet.toLowerCase();
  } catch {
    return false;
  }
}

interface SaveBody {
  agentAddress: string;
  walletAddress: string;
  config: unknown;
  ts: number;
  signature: string;
}

interface DeleteBody {
  agentAddress: string;
  walletAddress: string;
  ts: number;
  signature: string;
}

function parseSaveBody(parsed: Record<string, unknown>): SaveBody | { error: string } {
  const agentAddress = typeof parsed.agentAddress === 'string' ? parsed.agentAddress : null;
  const walletAddress = typeof parsed.walletAddress === 'string' ? parsed.walletAddress : null;
  const signature = typeof parsed.signature === 'string' ? parsed.signature : null;
  const ts = parsed.ts;
  const config = parsed.config;
  if (!agentAddress || !AGENT_RE.test(agentAddress)) return { error: 'invalid_agent_address' };
  if (!walletAddress || !isValidSuiAddress(walletAddress)) return { error: 'invalid_wallet_address' };
  if (!signature) return { error: 'missing_signature' };
  if (!isFreshTs(ts)) return { error: 'stale_or_invalid_ts' };
  if (config === undefined || config === null || typeof config !== 'object') return { error: 'missing_config' };
  return { agentAddress, walletAddress, config, ts: ts as number, signature };
}

function parseDeleteBody(parsed: Record<string, unknown>): DeleteBody | { error: string } {
  const agentAddress = typeof parsed.agentAddress === 'string' ? parsed.agentAddress : null;
  const walletAddress = typeof parsed.walletAddress === 'string' ? parsed.walletAddress : null;
  const signature = typeof parsed.signature === 'string' ? parsed.signature : null;
  const ts = parsed.ts;
  if (!agentAddress || !AGENT_RE.test(agentAddress)) return { error: 'invalid_agent_address' };
  if (!walletAddress || !isValidSuiAddress(walletAddress)) return { error: 'invalid_wallet_address' };
  if (!signature) return { error: 'missing_signature' };
  if (!isFreshTs(ts)) return { error: 'stale_or_invalid_ts' };
  return { agentAddress, walletAddress, ts: ts as number, signature };
}

export async function handleNasunAiConfigRequest(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  url: URL,
  corsHeaders: Record<string, string>,
): Promise<boolean> {
  const pathname = url.pathname;
  const writeCors = {
    ...corsHeaders,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-HMAC',
  };

  // POST /api/nasun-ai/config — browser saves trader config (wallet-sig auth)
  if (pathname === '/api/nasun-ai/config' && req.method === 'POST') {
    let body: Buffer;
    try {
      body = await readBody(req);
    } catch (err) {
      const code = (err as Error).message === 'body_too_large' ? 413 : 400;
      res.writeHead(code, writeCors);
      res.end(JSON.stringify({ error: (err as Error).message }));
      return true;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
    } catch {
      res.writeHead(400, writeCors);
      res.end(JSON.stringify({ error: 'invalid_json' }));
      return true;
    }

    const parsedBody = parseSaveBody(parsed);
    if ('error' in parsedBody) {
      res.writeHead(400, writeCors);
      res.end(JSON.stringify({ error: parsedBody.error }));
      return true;
    }

    let configJson: string;
    try {
      configJson = JSON.stringify(parsedBody.config);
      if (configJson.length > MAX_BODY_BYTES) throw new Error('config_too_large');
    } catch (err) {
      res.writeHead(400, writeCors);
      res.end(JSON.stringify({ error: (err as Error).message }));
      return true;
    }

    const agentLower = parsedBody.agentAddress.toLowerCase();
    const walletLower = parsedBody.walletAddress.toLowerCase();
    const configHash = sha256Hex(configJson);
    const message = `nasun-ai-config:save:v1:${walletLower}:${agentLower}:${configHash}:${parsedBody.ts}`;

    if (!(await verifyWalletSig(message, parsedBody.signature, walletLower))) {
      res.writeHead(401, writeCors);
      res.end(JSON.stringify({ error: 'bad_signature' }));
      return true;
    }

    // First-writer-wins ownership: existing row's wallet must match.
    const owner = existingOwner(agentLower);
    if (owner && owner !== walletLower) {
      res.writeHead(403, writeCors);
      res.end(JSON.stringify({ error: 'agent_owned_by_other_wallet' }));
      return true;
    }

    upsertConfig(agentLower, walletLower, configJson);

    // Phase 8: reconcile combined on-chain + server intent. A flip to
    // enabled:true spawns the runtime when on-chain is_active=true;
    // enabled:false stops it; on-chain killed leaves PM2 stopped.
    // Best-effort: action failures surface in `reconcile.reason` but the
    // config save itself is already committed.
    let reconcile: AgentStateResult;
    try {
      reconcile = await reconcileAgentState(agentLower);
    } catch (err) {
      reconcile = {
        state: 'unknown', runtime: 'stopped', action: 'noop',
        pending: true, reason: `reconcile_threw:${(err as Error).message}`,
      };
    }

    res.writeHead(200, { ...writeCors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, reconcile }));
    return true;
  }

  // DELETE /api/nasun-ai/config — browser deletes trader config (wallet-sig auth)
  if (pathname === '/api/nasun-ai/config' && req.method === 'DELETE') {
    let body: Buffer;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, writeCors);
      res.end(JSON.stringify({ error: 'bad_request' }));
      return true;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
    } catch {
      res.writeHead(400, writeCors);
      res.end(JSON.stringify({ error: 'invalid_json' }));
      return true;
    }

    const parsedBody = parseDeleteBody(parsed);
    if ('error' in parsedBody) {
      res.writeHead(400, writeCors);
      res.end(JSON.stringify({ error: parsedBody.error }));
      return true;
    }

    const agentLower = parsedBody.agentAddress.toLowerCase();
    const walletLower = parsedBody.walletAddress.toLowerCase();
    const message = `nasun-ai-config:delete:v1:${walletLower}:${agentLower}:${parsedBody.ts}`;

    if (!(await verifyWalletSig(message, parsedBody.signature, walletLower))) {
      res.writeHead(401, writeCors);
      res.end(JSON.stringify({ error: 'bad_signature' }));
      return true;
    }

    const owner = existingOwner(agentLower);
    if (owner && owner !== walletLower) {
      res.writeHead(403, writeCors);
      res.end(JSON.stringify({ error: 'agent_owned_by_other_wallet' }));
      return true;
    }

    deleteConfigRow(agentLower);

    // Phase 8: with the config row gone, reconcile sees enabled=false and
    // stops any running PM2 process. On-chain is_active is unchanged.
    let reconcile: AgentStateResult;
    try {
      reconcile = await reconcileAgentState(agentLower);
    } catch (err) {
      reconcile = {
        state: 'unknown', runtime: 'stopped', action: 'noop',
        pending: true, reason: `reconcile_threw:${(err as Error).message}`,
      };
    }

    res.writeHead(200, { ...writeCors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, reconcile }));
    return true;
  }

  // OPTIONS for config + agent state endpoints
  if (
    req.method === 'OPTIONS' &&
    (/^\/api\/nasun-ai\/config(\/[^/]+)?$/.test(pathname) ||
     /^\/api\/nasun-ai\/agent\/[^/]+\/state$/.test(pathname))
  ) {
    res.writeHead(204, writeCors);
    res.end();
    return true;
  }

  // GET /api/nasun-ai/agent/:addr/state — Phase 8 unified state read.
  //
  // Public read: returned fields are operational metadata (state, runtime,
  // on-chain is_active, server config.enabled, vault presence). No secrets.
  // IP rate-limited identically to GET /config to block enumeration scraping.
  // Doubles as a lazy reconcile trigger: callers see the latest derived state
  // including drift caused by external wallet deactivations within the 10s
  // sui-client cache window. Heavier drift is healed by the 60s on-chain
  // poller in agent-vault-killswitch.
  const stateMatch = pathname.match(/^\/api\/nasun-ai\/agent\/([^/]+)\/state$/);
  if (stateMatch && req.method === 'GET') {
    const agentAddress = stateMatch[1];
    if (!agentAddress || !AGENT_RE.test(agentAddress)) {
      res.writeHead(400, writeCors);
      res.end(JSON.stringify({ error: 'invalid_agent_address' }));
      return true;
    }
    if (!browserGetRateLimit(clientIp(req)) || !stateGlobalRateLimit()) {
      res.writeHead(429, writeCors);
      res.end(JSON.stringify({ error: 'rate_limited' }));
      return true;
    }
    try {
      const snapshot = await readAgentStateSnapshot(agentAddress);
      res.writeHead(200, { ...writeCors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(snapshot));
    } catch (err) {
      res.writeHead(500, writeCors);
      res.end(JSON.stringify({ error: 'state_read_failed', detail: (err as Error).message }));
    }
    return true;
  }

  // GET /api/nasun-ai/config/:agentAddress
  //   With X-HMAC header: runtime path (HMAC-authenticated).
  //   Without X-HMAC: browser path (no auth; per-IP rate-limited).
  const getMatch = pathname.match(/^\/api\/nasun-ai\/config\/([^/]+)$/);
  if (getMatch && req.method === 'GET') {
    const agentAddress = getMatch[1];
    if (!agentAddress || !AGENT_RE.test(agentAddress)) {
      res.writeHead(400, writeCors);
      res.end(JSON.stringify({ error: 'invalid_agent_address' }));
      return true;
    }

    const hmacHeader = req.headers['x-hmac'];
    if (typeof hmacHeader === 'string') {
      // Runtime path: HMAC over the lowercase agent address (no body).
      const agentBuf = Buffer.from(agentAddress.toLowerCase(), 'utf8');
      if (!verifyHmac(agentBuf, hmacHeader)) {
        res.writeHead(401, writeCors);
        res.end(JSON.stringify({ error: 'bad_hmac' }));
        return true;
      }
    } else {
      // Browser path: IP rate-limited, no auth. Configs are public
      // operational metadata (not secrets), but enumeration is blocked.
      if (!browserGetRateLimit(clientIp(req))) {
        res.writeHead(429, writeCors);
        res.end(JSON.stringify({ error: 'rate_limited' }));
        return true;
      }
    }

    const row = getConfig(agentAddress);
    if (!row) {
      res.writeHead(404, writeCors);
      res.end(JSON.stringify({ error: 'not_found' }));
      return true;
    }

    res.writeHead(200, { ...writeCors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ config: JSON.parse(row.config_json), updatedAt: row.updated_at }));
    return true;
  }

  return false;
}
