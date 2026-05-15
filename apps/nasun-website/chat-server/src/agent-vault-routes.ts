// PR2.A — Agent vault HTTP routes.
//
// Endpoints (mounted under /api/nasun-ai/vault/* by server.ts):
//   POST   /api/nasun-ai/vault/challenge      — mint sig challenge
//   POST   /api/nasun-ai/vault/upload         — upload keypair → SSM + spawn PM2
//   DELETE /api/nasun-ai/vault/agent/:addr    — soft delete + stop PM2
//   POST   /api/nasun-ai/vault/agent/:addr/restore — restore within 7-day grace
//   GET    /api/nasun-ai/vault/agent/:addr/status  — public-read minimal status
//
// Auth: challenge + ed25519 wallet sig. Reuses pendingChallenges /
// consumeChallenge from baram-telegram-routes for crypto consistency.
// Chain ownership is checked twice (at challenge issue + at upload) via
// SuiClient — SQLite never trusted as source of truth (defense-in-depth
// vs. a hypothetical config-route compromise).
//
// Bulk /list endpoint is intentionally absent: each PM2 process fetches
// only its own SSM Parameter, so chat-server has no shared bearer that,
// if leaked, dumps every tenant's keypair.

import { randomBytes, createHash } from 'node:crypto';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
  DeleteParameterCommand,
} from '@aws-sdk/client-ssm';
import { isValidSuiAddress } from './auth.js';
import {
  pendingChallenges,
  consumeChallenge,
  buildChallengeText,
  VAULT_CHALLENGE_TTL_MS,
  VAULT_MAX_PENDING_CHALLENGES,
  type ChallengeEntry,
  type Purpose,
} from './baram-telegram-routes.js';
import { verifyCapabilityOwner } from './sui-capability-utils.js';
import { getDb } from './store.js';
import { upsertEndpoint } from './baram-agent-registry.js';
import {
  spawnAgentPm2,
  stopAgentPm2,
  allocatePort,
  pm2NameForAgent,
  hasLegacyNasunAiRuntime,
} from './agent-orchestrator.js';

const PARAM_PREFIX = process.env.AGENT_VAULT_PARAM_PREFIX || '/nasun/ai-agent';
const RATE_LIMIT_PER_WALLET_PER_MINUTE = 5;
const RATE_LIMIT_PER_IP_PER_MINUTE = 10;
const STATUS_RATE_LIMIT_PER_IP_PER_MINUTE = 30;

let ssmClient: SSMClient | null = null;
function getSsm(): SSMClient {
  if (!ssmClient) ssmClient = new SSMClient({});
  return ssmClient;
}

function paramNameFor(agentAddress: string): string {
  return `${PARAM_PREFIX}/${agentAddress.toLowerCase()}`;
}

// --- per-(IP, wallet) sliding-window rate limit, in-memory ---------------
interface RateBucket { count: number; resetAt: number; }
const rateBuckets = new Map<string, RateBucket>();
function rateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateBuckets) if (v.resetAt < now) rateBuckets.delete(k);
}, 60_000).unref();

// --- per-agent mutex to serialize spawn races ----------------------------
const spawnLocks = new Map<string, Promise<unknown>>();
async function withAgentLock<T>(agentAddress: string, fn: () => Promise<T>): Promise<T> {
  const prev = spawnLocks.get(agentAddress);
  if (prev) await prev.catch(() => {/* ignore */});
  const p = (async () => fn())();
  spawnLocks.set(agentAddress, p);
  try { return await p; } finally {
    if (spawnLocks.get(agentAddress) === p) spawnLocks.delete(agentAddress);
  }
}

// --- helpers --------------------------------------------------------------
const VAULT_BODY_MAX = 8 * 1024;

async function readJsonBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > VAULT_BODY_MAX) { req.destroy(); reject(new Error('body_too_large')); return; }
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (body.length === 0) { resolve({}); return; }
      try { resolve(JSON.parse(body)); } catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function writeJson(
  res: import('node:http').ServerResponse,
  status: number,
  headers: Record<string, string>,
  payload: unknown,
): void {
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function clientIp(req: import('node:http').IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// PR2.A: redacts agentSecretKey/signature from any payload before logging
// or error throw. Try/catch sites must use this; raw body to console.error
// or Error.message risks leaking the keypair in pm2 logs.
export function redactedPayload(p: Record<string, unknown>): string {
  const clone: Record<string, unknown> = { ...p };
  if ('agentSecretKey' in clone) clone.agentSecretKey = '[REDACTED]';
  if ('signature' in clone) clone.signature = '[REDACTED]';
  return JSON.stringify(clone);
}

function pubkeyHashHex(pubkeyBytes: Uint8Array): string {
  return createHash('sha256').update(pubkeyBytes).digest('hex');
}

// --- handlers -------------------------------------------------------------

/** POST /api/nasun-ai/vault/challenge */
export async function handleVaultChallenge(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  let body: unknown;
  try { body = await readJsonBody(req); } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { error: (err as Error).message });
    return;
  }
  const b = body as Record<string, unknown>;
  const ownerWallet = typeof b.ownerWallet === 'string' ? b.ownerWallet : null;
  const agentAddress = typeof b.agentAddress === 'string' ? b.agentAddress : null;
  const pubkeyHash = typeof b.pubkeyHash === 'string' ? b.pubkeyHash : null;
  const purpose = b.purpose as Purpose | undefined;
  const capabilityId = typeof b.capabilityId === 'string' ? b.capabilityId : null;

  if (!ownerWallet || !isValidSuiAddress(ownerWallet)) {
    writeJson(res, 400, corsHeaders, { error: 'invalid_wallet' }); return;
  }
  if (!agentAddress || !isValidSuiAddress(agentAddress)) {
    writeJson(res, 400, corsHeaders, { error: 'invalid_agent' }); return;
  }
  if (purpose !== 'vault-upload' && purpose !== 'vault-delete' && purpose !== 'vault-restore') {
    writeJson(res, 400, corsHeaders, { error: 'invalid_purpose' }); return;
  }
  if (purpose === 'vault-upload') {
    if (!pubkeyHash || !/^[0-9a-f]{64}$/.test(pubkeyHash)) {
      writeJson(res, 400, corsHeaders, { error: 'invalid_pubkey_hash' }); return;
    }
    if (!capabilityId || !isValidSuiAddress(capabilityId)) {
      writeJson(res, 400, corsHeaders, { error: 'invalid_capability_id' }); return;
    }
  }

  const ip = clientIp(req);
  if (!rateLimit(`vault-challenge:ip:${ip}`, RATE_LIMIT_PER_IP_PER_MINUTE)
      || !rateLimit(`vault-challenge:wallet:${ownerWallet.toLowerCase()}`, RATE_LIMIT_PER_WALLET_PER_MINUTE)) {
    writeJson(res, 429, corsHeaders, { error: 'rate_limited' }); return;
  }

  // PR2.A A3: chain ownership pre-check at challenge issue. For
  // vault-upload, capabilityId is fresh (user-provided). For delete/restore,
  // resolve from the agent_keys row.
  let resolvedCapId = capabilityId;
  if (purpose !== 'vault-upload') {
    const row = getDb()
      .prepare(`SELECT capability_id FROM agent_keys WHERE agent_address = ?`)
      .get(agentAddress.toLowerCase()) as { capability_id: string | null } | undefined;
    resolvedCapId = row?.capability_id ?? null;
  }
  if (resolvedCapId) {
    const ok = await verifyCapabilityOwner(resolvedCapId, ownerWallet);
    if (!ok) {
      writeJson(res, 401, corsHeaders, { error: 'not_capability_owner' }); return;
    }
  }
  // If capability_id is unknown (delete/restore on a row missing capability_id),
  // we fall through and rely on the upload-time signature alone. Older agent_keys
  // rows from initial PR2.C migration may have capability_id=NULL.

  if (pendingChallenges.size >= VAULT_MAX_PENDING_CHALLENGES) {
    writeJson(res, 503, corsHeaders, { error: 'challenge_capacity' }); return;
  }

  const now = Date.now();
  const nonce = randomBytes(16).toString('hex');
  const issuedIso = new Date(now).toISOString();
  const entry: Omit<ChallengeEntry, 'expiresAt'> = {
    wallet: ownerWallet.toLowerCase(),
    purpose,
    agent: agentAddress.toLowerCase(),
    capabilityId: resolvedCapId ? resolvedCapId.toLowerCase() : undefined,
    pubkeyHash: pubkeyHash || undefined,
  };
  const challenge = buildChallengeText(entry, nonce, issuedIso);
  pendingChallenges.set(challenge, { ...entry, expiresAt: now + VAULT_CHALLENGE_TTL_MS });

  writeJson(res, 200, corsHeaders, { challenge, expiresAt: now + VAULT_CHALLENGE_TTL_MS });
}

/** POST /api/nasun-ai/vault/upload */
export async function handleVaultUpload(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  let body: unknown;
  try { body = await readJsonBody(req); } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { error: (err as Error).message });
    return;
  }
  const b = body as Record<string, unknown>;

  // Rate limit early so rejected requests don't churn pendingChallenges or KMS.
  const ip = clientIp(req);
  if (!rateLimit(`vault-upload:ip:${ip}`, RATE_LIMIT_PER_IP_PER_MINUTE)) {
    writeJson(res, 429, corsHeaders, { error: 'rate_limited' }); return;
  }

  const result = await consumeChallenge(b, 'vault-upload');
  if (!result.ok) {
    const status = result.reason === 'bad_signature' ? 401
                 : result.reason === 'expired' ? 410
                 : 400;
    writeJson(res, status, corsHeaders, { error: result.reason });
    return;
  }
  const { entry } = result;
  const agentAddress = entry.agent!;          // guaranteed by buildChallengeText
  const ownerWallet = entry.wallet;
  const expectedPubkeyHash = entry.pubkeyHash!;
  const capabilityId = entry.capabilityId!;

  const agentSecretKey = typeof b.agentSecretKey === 'string' ? b.agentSecretKey : null;
  if (!agentSecretKey) {
    writeJson(res, 400, corsHeaders, { error: 'missing_secret' }); return;
  }

  // Derive + verify
  let derivedAddress: string;
  let derivedPubkeyHash: string;
  try {
    const kp = Ed25519Keypair.fromSecretKey(agentSecretKey);
    derivedAddress = kp.toSuiAddress().toLowerCase();
    derivedPubkeyHash = pubkeyHashHex(kp.getPublicKey().toRawBytes());
  } catch {
    writeJson(res, 400, corsHeaders, { error: 'invalid_secret_format' }); return;
  }
  if (derivedAddress !== agentAddress) {
    writeJson(res, 400, corsHeaders, { error: 'address_mismatch' }); return;
  }
  if (derivedPubkeyHash !== expectedPubkeyHash) {
    writeJson(res, 400, corsHeaders, { error: 'pubkey_hash_mismatch' }); return;
  }

  // Re-verify chain ownership at upload time (challenge could have been
  // issued 5 minutes ago; ownership might have changed).
  if (!await verifyCapabilityOwner(capabilityId, ownerWallet)) {
    writeJson(res, 401, corsHeaders, { error: 'not_capability_owner' }); return;
  }

  // Setup 1 race guard: refuse upload while legacy nasun-ai-runtime PM2
  // process is running for this agent address.
  if (await hasLegacyNasunAiRuntime(agentAddress)) {
    writeJson(res, 409, corsHeaders, {
      error: 'setup1_legacy_running',
      hint: 'Stop the legacy nasun-ai-runtime PM2 process before activating this agent.',
    });
    return;
  }

  await withAgentLock(agentAddress, async () => {
    // Already-active short-circuit
    const existing = getDb()
      .prepare(`SELECT pm2_name, wake_port, deleted_at, param_name
                FROM agent_keys WHERE agent_address = ?`)
      .get(agentAddress) as
        | { pm2_name: string; wake_port: number; deleted_at: number | null; param_name: string }
        | undefined;
    if (existing && existing.deleted_at === null) {
      writeJson(res, 409, corsHeaders, { error: 'already_active' });
      return;
    }

    const paramName = paramNameFor(agentAddress);

    // SSM PutParameter (Overwrite=false catches concurrent uploads).
    try {
      await getSsm().send(new PutParameterCommand({
        Name: paramName,
        Type: 'SecureString',
        Value: agentSecretKey,
        Overwrite: existing ? true : false,  // restore-after-purge case
        Tier: 'Standard',
        Tags: existing ? undefined : [
          { Key: 'ownerWallet', Value: ownerWallet },
          { Key: 'agentAddress', Value: agentAddress },
        ],
      }));
    } catch (err) {
      // Do NOT include raw body or err.message that might echo body content.
      console.error(`[vault-upload] SSM PutParameter failed for ${paramName}: ${(err as Error).name}`);
      writeJson(res, 500, corsHeaders, { error: 'vault_store_failed' });
      return;
    }

    const wakePort = existing ? existing.wake_port : allocatePort();
    const pm2Name = existing ? existing.pm2_name : pm2NameForAgent(agentAddress);
    const now = Date.now();

    if (existing) {
      getDb().prepare(
        `UPDATE agent_keys
         SET wallet_address = ?, capability_id = ?, deleted_at = NULL,
             wake_port = ?, last_used_at = ?
         WHERE agent_address = ?`
      ).run(ownerWallet, capabilityId, wakePort, now, agentAddress);
    } else {
      getDb().prepare(
        `INSERT INTO agent_keys
           (agent_address, wallet_address, capability_id, param_name, pm2_name,
            wake_port, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(agentAddress, ownerWallet, capabilityId, paramName, pm2Name, wakePort, now);
    }

    // Spawn PM2. Failure here should not orphan the SSM parameter — leave it
    // (status endpoint will show 'inactive') and surface the error to the
    // caller so they can retry.
    try {
      await spawnAgentPm2({ agentAddress, pm2Name, paramName, wakePort });
    } catch (err) {
      console.error(`[vault-upload] spawn failed for ${pm2Name}: ${(err as Error).message}`);
      writeJson(res, 500, corsHeaders, { error: 'spawn_failed', pm2Name, wakePort });
      return;
    }

    writeJson(res, 200, corsHeaders, {
      ok: true,
      paramName,
      pm2Name,
      wakePort,
    });
  });
}

/** DELETE /api/nasun-ai/vault/agent/:agentAddress */
export async function handleVaultDelete(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
  agentAddress: string,
): Promise<void> {
  if (!isValidSuiAddress(agentAddress)) {
    writeJson(res, 400, corsHeaders, { error: 'invalid_agent' }); return;
  }
  let body: unknown;
  try { body = await readJsonBody(req); } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { error: (err as Error).message }); return;
  }
  const result = await consumeChallenge(body as Record<string, unknown>, 'vault-delete');
  if (!result.ok) {
    const status = result.reason === 'bad_signature' ? 401
                 : result.reason === 'expired' ? 410 : 400;
    writeJson(res, status, corsHeaders, { error: result.reason }); return;
  }
  if (result.entry.agent?.toLowerCase() !== agentAddress.toLowerCase()) {
    writeJson(res, 400, corsHeaders, { error: 'agent_mismatch' }); return;
  }

  // Defense-in-depth: bind delete to the row's recorded wallet_address.
  // The challenge already includes the agent address in the signed text and
  // (when capability_id is non-null) chain ownership is pre-checked at
  // challenge issue. Matching wallet_address here closes the residual
  // "capability_id IS NULL" fall-through path before any future PR2.C
  // migration can introduce NULL rows.
  const row = getDb()
    .prepare(
      `SELECT pm2_name FROM agent_keys
       WHERE agent_address = ? AND wallet_address = ? AND deleted_at IS NULL`,
    )
    .get(agentAddress.toLowerCase(), result.entry.wallet) as
      { pm2_name: string } | undefined;
  if (!row) { writeJson(res, 404, corsHeaders, { error: 'not_active' }); return; }

  await withAgentLock(agentAddress.toLowerCase(), async () => {
    try {
      await stopAgentPm2(row.pm2_name);
    } catch (err) {
      console.error(`[vault-delete] stopAgentPm2 failed: ${(err as Error).message}`);
      // continue — soft delete still proceeds; orphan PM2 process can be cleaned manually
    }
    const now = Date.now();
    getDb().prepare(`UPDATE agent_keys SET deleted_at = ? WHERE agent_address = ?`)
      .run(now, agentAddress.toLowerCase());
    getDb().prepare(`DELETE FROM baram_agent_endpoints WHERE agent = ?`)
      .run(agentAddress.toLowerCase());
    const recoveryWindowEndsAt = now + 7 * 24 * 60 * 60 * 1000;
    writeJson(res, 200, corsHeaders, { ok: true, recoveryWindowEndsAt });
  });
}

/** POST /api/nasun-ai/vault/agent/:agentAddress/restore */
export async function handleVaultRestore(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
  agentAddress: string,
): Promise<void> {
  if (!isValidSuiAddress(agentAddress)) {
    writeJson(res, 400, corsHeaders, { error: 'invalid_agent' }); return;
  }
  let body: unknown;
  try { body = await readJsonBody(req); } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { error: (err as Error).message }); return;
  }
  const result = await consumeChallenge(body as Record<string, unknown>, 'vault-restore');
  if (!result.ok) {
    const status = result.reason === 'bad_signature' ? 401
                 : result.reason === 'expired' ? 410 : 400;
    writeJson(res, status, corsHeaders, { error: result.reason }); return;
  }
  if (result.entry.agent?.toLowerCase() !== agentAddress.toLowerCase()) {
    writeJson(res, 400, corsHeaders, { error: 'agent_mismatch' }); return;
  }

  // Defense-in-depth: same wallet_address binding as delete.
  const row = getDb().prepare(
    `SELECT param_name, pm2_name, deleted_at FROM agent_keys
     WHERE agent_address = ? AND wallet_address = ?`
  ).get(agentAddress.toLowerCase(), result.entry.wallet) as
    { param_name: string; pm2_name: string; deleted_at: number | null } | undefined;
  if (!row) { writeJson(res, 404, corsHeaders, { error: 'not_vaulted' }); return; }
  if (row.deleted_at === null) { writeJson(res, 409, corsHeaders, { error: 'still_active' }); return; }
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - row.deleted_at > sevenDaysMs) {
    writeJson(res, 410, corsHeaders, { error: 'grace_window_expired' }); return;
  }

  // Verify SSM parameter still exists (cron may have raced ahead).
  try {
    await getSsm().send(new GetParameterCommand({ Name: row.param_name, WithDecryption: false }));
  } catch (err) {
    if ((err as { name?: string }).name === 'ParameterNotFound') {
      writeJson(res, 410, corsHeaders, { error: 'already_purged' }); return;
    }
    console.error(`[vault-restore] SSM lookup failed: ${(err as Error).name}`);
    writeJson(res, 500, corsHeaders, { error: 'vault_lookup_failed' }); return;
  }

  await withAgentLock(agentAddress.toLowerCase(), async () => {
    // Wake port may have been reassigned to another agent during the grace
    // window. Reallocate (UX: "wake port may change" — surfaced in response).
    let newPort: number;
    try { newPort = allocatePort(); }
    catch { writeJson(res, 503, corsHeaders, { error: 'no_free_port' }); return; }

    getDb().prepare(
      `UPDATE agent_keys SET deleted_at = NULL, wake_port = ?, last_used_at = ?
       WHERE agent_address = ?`
    ).run(newPort, Date.now(), agentAddress.toLowerCase());

    try {
      await spawnAgentPm2({
        agentAddress: agentAddress.toLowerCase(),
        pm2Name: row.pm2_name,
        paramName: row.param_name,
        wakePort: newPort,
      });
    } catch (err) {
      console.error(`[vault-restore] spawn failed: ${(err as Error).message}`);
      writeJson(res, 500, corsHeaders, { error: 'spawn_failed' }); return;
    }
    writeJson(res, 200, corsHeaders, { ok: true, wakePort: newPort });
  });
}

/** GET /api/nasun-ai/vault/agent/:agentAddress/status */
export async function handleVaultStatus(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
  agentAddress: string,
): Promise<void> {
  if (!isValidSuiAddress(agentAddress)) {
    writeJson(res, 400, corsHeaders, { error: 'invalid_agent' }); return;
  }
  if (!rateLimit(`vault-status:ip:${clientIp(req)}`, STATUS_RATE_LIMIT_PER_IP_PER_MINUTE)) {
    writeJson(res, 429, corsHeaders, { error: 'rate_limited' }); return;
  }
  const row = getDb().prepare(
    `SELECT deleted_at FROM agent_keys WHERE agent_address = ?`
  ).get(agentAddress.toLowerCase()) as { deleted_at: number | null } | undefined;

  if (!row) {
    writeJson(res, 200, corsHeaders, { state: 'not_vaulted', graceEndsAt: null });
    return;
  }
  if (row.deleted_at !== null) {
    const graceEndsAt = row.deleted_at + 7 * 24 * 60 * 60 * 1000;
    if (Date.now() > graceEndsAt) {
      writeJson(res, 200, corsHeaders, { state: 'not_vaulted', graceEndsAt: null });
    } else {
      writeJson(res, 200, corsHeaders, { state: 'grace', graceEndsAt });
    }
    return;
  }
  // Active row → check endpoint freshness (60s heartbeat × 1.5x slack).
  const ep = getDb().prepare(
    `SELECT last_seen FROM baram_agent_endpoints WHERE agent = ?`
  ).get(agentAddress.toLowerCase()) as { last_seen: number } | undefined;
  const fresh = ep ? (Date.now() - ep.last_seen < 90_000) : false;
  writeJson(res, 200, corsHeaders, {
    state: fresh ? 'active' : 'inactive',
    graceEndsAt: null,
  });
}
