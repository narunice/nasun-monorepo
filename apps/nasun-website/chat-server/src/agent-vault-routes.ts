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
  AgentDisabledError,
  invalidateAgentOnChainCache,
} from './agent-orchestrator.js';
import { readAgentProfileIsActive } from './sui-client.js';
import {
  enforceAlphaGuards,
  withSlotReservation,
  consumeWaitlistInvite,
  getAgentTtlMs,
  isAlphaGateEnabled,
  GuardError,
} from './alpha-guards.js';
import { processQueueTick } from './alpha-cron.js';

const PARAM_PREFIX = process.env.AGENT_VAULT_PARAM_PREFIX || '/nasun/ai-agent';
const RATE_LIMIT_PER_WALLET_PER_MINUTE = 5;
const RATE_LIMIT_PER_IP_PER_MINUTE = 10;
const STATUS_RATE_LIMIT_PER_IP_PER_MINUTE = 30;

let ssmClient: SSMClient | null = null;
function getSsm(): SSMClient {
  if (!ssmClient) {
    // SDK v3 region resolution from EC2 metadata occasionally fails
    // ("Region is missing"). Pin to ap-northeast-2 (the prod EC2 region)
    // with env override.
    ssmClient = new SSMClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });
  }
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
  //
  // vault-delete needs an active row (deleted_at IS NULL).
  // vault-restore needs a soft-deleted row (deleted_at IS NOT NULL) — use a
  // separate query so that capability_id can still be resolved and verified.
  let resolvedCapId = capabilityId;
  if (purpose !== 'vault-upload') {
    const isDelete = purpose === 'vault-delete';
    const row = getDb()
      .prepare(
        isDelete
          ? `SELECT capability_id FROM agent_keys WHERE agent_address = ? AND deleted_at IS NULL`
          : `SELECT capability_id FROM agent_keys WHERE agent_address = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 1`,
      )
      .get(agentAddress.toLowerCase()) as { capability_id: string | null } | undefined;
    // Fail fast at challenge time: no point prompting the user to sign a
    // challenge that the action handler will immediately reject.
    if (!row) {
      writeJson(res, 422, corsHeaders, {
        error: isDelete ? 'not_active' : 'not_vaulted',
      }); return;
    }
    resolvedCapId = row.capability_id;
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
  // Optional AER v3 attribution. Validated as a 32-byte hex object id when present.
  const profileId = typeof b.profileId === 'string' && /^0x[0-9a-f]{64}$/i.test(b.profileId)
    ? b.profileId.toLowerCase()
    : null;

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

  // PR-2 alpha gate. Returns slotExempt=true for santa-class agents,
  // which makes withSlotReservation a no-op and skips the expires_at
  // stamp below. When ALPHA_GATE_ENABLED=false the helper short-circuits
  // and reports slotExempt=false, which is correct (no TTL is applied
  // because we only stamp expires_at when the gate is on).
  let guard;
  try {
    guard = enforceAlphaGuards(ownerWallet, agentAddress);
  } catch (err) {
    if (err instanceof GuardError) {
      writeJson(res, err.httpStatus, corsHeaders, { error: err.code });
      return;
    }
    throw err;
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

    // Wrap SSM + INSERT + spawn in a slot reservation so the in-memory
    // pendingSlots counter holds across the SSM await — see alpha-guards.ts.
    // No-op when slotExempt=true (santa) or when the gate is OFF.
    try {
      await withSlotReservation(guard.slotExempt, async () => {
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
          // SDK service errors carry a `$metadata` payload — surface the
          // status + AWS error name without leaking the secret value.
          const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number }; Code?: string };
          console.error(
            `[vault-upload] SSM PutParameter failed for ${paramName}: ` +
            `name=${e.name ?? 'unknown'} ` +
            `code=${e.Code ?? 'n/a'} ` +
            `status=${e.$metadata?.httpStatusCode ?? 'n/a'} ` +
            `msg=${(e.message ?? '').slice(0, 200)}`,
          );
          writeJson(res, 500, corsHeaders, { error: 'vault_store_failed' });
          return;
        }

        const wakePort = existing ? existing.wake_port : allocatePort();
        const pm2Name = existing ? existing.pm2_name : pm2NameForAgent(agentAddress);
        const now = Date.now();
        // PR-2 alpha TTL: stamp a 36h expiry on non-exempt agents only when
        // the gate is on. When the gate flips off later, existing stamps stay
        // and the cron stops sweeping (no tick runs), so the agent keeps
        // running until the user deactivates — that matches "rollback = no
        // forced expiries" in v2 §11.
        const stampExpiry = !guard.slotExempt && isAlphaGateEnabled();
        const expiresAt = stampExpiry ? now + getAgentTtlMs() : null;

        if (existing) {
          getDb().prepare(
            `UPDATE agent_keys
             SET wallet_address = ?, capability_id = ?, deleted_at = NULL,
                 wake_port = ?, last_used_at = ?,
                 expires_at = ?, paused_at = NULL, warned_at = NULL,
                 profile_id = COALESCE(?, profile_id)
             WHERE agent_address = ?`
          ).run(ownerWallet, capabilityId, wakePort, now, expiresAt, profileId, agentAddress);
        } else {
          getDb().prepare(
            `INSERT INTO agent_keys
               (agent_address, wallet_address, capability_id, param_name, pm2_name,
                wake_port, created_at, expires_at, profile_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(agentAddress, ownerWallet, capabilityId, paramName, pm2Name, wakePort, now, expiresAt, profileId);
        }

        // Spawn PM2. Failure here should not orphan the SSM parameter — leave it
        // (status endpoint will show 'inactive') and surface the error to the
        // caller so they can retry.
        //
        // Phase 6/8: spawnAgentPm2 refuses when the trader config has
        // enabled:false. New agents typically save with enabled:false and
        // only flip true on the user's explicit activate toggle, so vault
        // upload commonly hits the disabled gate. Treat it as success: the
        // upload finished; the next save-with-enabled will spawn via
        // reconcileAgentState.
        try {
          await spawnAgentPm2({ agentAddress, pm2Name, paramName, wakePort });
        } catch (err) {
          if (err instanceof AgentDisabledError) {
            console.log(`[vault-upload] spawn deferred: ${pm2Name} ${err.message}`);
          } else {
            console.error(`[vault-upload] spawn failed for ${pm2Name}: ${(err as Error).message}`);
            writeJson(res, 500, corsHeaders, { error: 'spawn_failed', pm2Name, wakePort });
            return;
          }
        }

        // Consume the waitlist invite so this slot is no longer "promised"
        // to the user. Idempotent — santa / gate-off paths have nothing to
        // remove. Trigger an in-process queue tick so the next user gets
        // promoted immediately instead of waiting up to 60s.
        consumeWaitlistInvite(ownerWallet);
        void processQueueTick().catch((err) => {
          console.warn('[alpha] processQueueTick after upload failed:', (err as Error).message);
        });

        writeJson(res, 200, corsHeaders, {
          ok: true,
          paramName,
          pm2Name,
          wakePort,
        });
      });
    } catch (err) {
      if (err instanceof GuardError) {
        writeJson(res, err.httpStatus, corsHeaders, { error: err.code });
        return;
      }
      throw err;
    }
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
      `SELECT pm2_name, profile_id FROM agent_keys
       WHERE agent_address = ? AND wallet_address = ? AND deleted_at IS NULL`,
    )
    .get(agentAddress.toLowerCase(), result.entry.wallet) as
      { pm2_name: string; profile_id: string | null } | undefined;
  if (!row) { writeJson(res, 422, corsHeaders, { error: 'not_active' }); return; }

  // Phase 8 — on-chain AgentProfile.owner cross-check. Belt-and-suspenders
  // for legacy rows where capability_id is NULL (the challenge handler's
  // verifyCapabilityOwner gate falls through in that case). Skipped when
  // profile_id is also NULL (truly legacy row predating AER v3 backfill);
  // those rely on wallet_address binding alone.
  if (row.profile_id) {
    const snap = await readAgentProfileIsActive(row.profile_id);
    // readAgentProfileIsActive already lowercases owner; normalize the
    // challenge-side wallet too so a mixed-case ChallengeEntry.wallet
    // (defense-in-depth — the challenge issuer should already lowercase)
    // cannot lock out a legitimate kill.
    if (snap && snap.owner !== result.entry.wallet.toLowerCase()) {
      writeJson(res, 401, corsHeaders, { error: 'not_profile_owner' });
      return;
    }
    // snap === null: RPC failure. Do not reject — challenge-issue cap-owner
    // check already covers the non-null-capability path. Soft-fail to
    // preserve user-initiated kill flow during transient RPC outages.
  }

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
    if (row.profile_id) invalidateAgentOnChainCache(row.profile_id);
    // PR-2 alpha: user-initiated deactivate frees a cap slot. Run an
    // immediate invite pass so the next queued user gets promoted now
    // instead of waiting up to 60s for the next cron tick.
    void processQueueTick().catch((err) => {
      console.warn('[alpha] processQueueTick after delete failed:', (err as Error).message);
    });
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
  if (!row) { writeJson(res, 422, corsHeaders, { error: 'not_vaulted' }); return; }
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

  // PR-2 alpha gate. Restore is functionally a fresh activation from the
  // cap accounting perspective (the row was soft-deleted, so it was
  // already freed from `countActiveAgents`), so it must re-acquire a slot
  // via the same guard path as upload.
  let restoreGuard;
  try {
    restoreGuard = enforceAlphaGuards(result.entry.wallet, agentAddress);
  } catch (err) {
    if (err instanceof GuardError) {
      writeJson(res, err.httpStatus, corsHeaders, { error: err.code });
      return;
    }
    throw err;
  }

  await withAgentLock(agentAddress.toLowerCase(), async () => {
    try {
      await withSlotReservation(restoreGuard.slotExempt, async () => {
        // Wake port may have been reassigned to another agent during the grace
        // window. Reallocate (UX: "wake port may change" — surfaced in response).
        let newPort: number;
        try { newPort = allocatePort(); }
        catch { writeJson(res, 503, corsHeaders, { error: 'no_free_port' }); return; }

        const stampExpiry = !restoreGuard.slotExempt && isAlphaGateEnabled();
        const expiresAt = stampExpiry ? Date.now() + getAgentTtlMs() : null;

        getDb().prepare(
          `UPDATE agent_keys
              SET deleted_at = NULL, wake_port = ?, last_used_at = ?,
                  expires_at = ?, paused_at = NULL, warned_at = NULL
            WHERE agent_address = ?`
        ).run(newPort, Date.now(), expiresAt, agentAddress.toLowerCase());

        try {
          await spawnAgentPm2({
            agentAddress: agentAddress.toLowerCase(),
            pm2Name: row.pm2_name,
            paramName: row.param_name,
            wakePort: newPort,
          });
        } catch (err) {
          if (err instanceof AgentDisabledError) {
            // Phase 6: restored but trader config says enabled:false; user
            // will reactivate explicitly through Settings save.
            console.log(`[vault-restore] spawn deferred: ${row.pm2_name} ${err.message}`);
          } else {
            console.error(`[vault-restore] spawn failed: ${(err as Error).message}`);
            writeJson(res, 500, corsHeaders, { error: 'spawn_failed' }); return;
          }
        }

        consumeWaitlistInvite(result.entry.wallet);
        void processQueueTick().catch((err) => {
          console.warn('[alpha] processQueueTick after restore failed:', (err as Error).message);
        });

        writeJson(res, 200, corsHeaders, { ok: true, wakePort: newPort });
      });
    } catch (err) {
      if (err instanceof GuardError) {
        writeJson(res, err.httpStatus, corsHeaders, { error: err.code });
        return;
      }
      throw err;
    }
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
