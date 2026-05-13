/**
 * Smoke S10 / S11: HMAC token tampering + replay.
 *
 * S10 — Token tampering:
 *   1. Call /infer normally; capture (spendToken, nonce, expiresAt, resultHash).
 *   2. Submit /execute-capability with the resultHash mutated by 1 bit.
 *   3. Expect HTTP 403 with `reason: 'invalid'`.
 *
 * S11 — Token replay:
 *   1. Call /infer normally.
 *   2. Submit /execute-capability twice with the SAME (spendToken, nonce, expiresAt).
 *   3. First call may succeed or fail on its own merits. Second call MUST
 *      return HTTP 403 with `reason: 'replay'`.
 *
 * The script does not depend on a particular envelope shape — for both
 * S10 and S11 the failure must surface BEFORE preflight, so we use a
 * minimal well-formed body.
 *
 * Usage (from monorepo root):
 *   HOST_URL=https://<host> HOST_API_KEY=... CAPABILITY_ID=0x... \
 *   WALLET_ADDRESS=0x... ESCROW_ID=0x... \
 *   COIN_NUSDC_TYPE=... COIN_NBTC_TYPE=... \
 *   npx tsx apps/baram/scripts/smoke-token-replay.ts
 */

const HOST_URL = required('HOST_URL');
const API_KEY = required('HOST_API_KEY');
const CAPABILITY_ID = required('CAPABILITY_ID');
const WALLET_ADDRESS = required('WALLET_ADDRESS');

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`[smoke-token-replay] FATAL: env "${key}" is unset.`);
    process.exit(1);
  }
  return v;
}

interface InferOk {
  success: true;
  result: string;
  resultHash: string;
  executionTimeMs: number;
  spendToken: string;
  nonce: string;
  expiresAt: number;
}

async function callInfer(requestId: number): Promise<InferOk> {
  const body = JSON.stringify({
    requestId,
    encryptedPrompt: Buffer.from('hello', 'utf-8').toString('base64'),
    model: process.env.MODEL ?? 'llama-3.3-70b-versatile',
    capabilityId: CAPABILITY_ID,
    walletAddress: WALLET_ADDRESS,
  });
  const resp = await fetch(`${HOST_URL}/infer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body,
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) {
    throw new Error(`/infer failed: HTTP ${resp.status} ${JSON.stringify(data)}`);
  }
  return data as InferOk;
}

function minimalCognitionBody(inf: InferOk, requestId: number) {
  return {
    requestId,
    resultHash: inf.resultHash,
    executionTimeMs: inf.executionTimeMs,
    spendToken: inf.spendToken,
    nonce: inf.nonce,
    expiresAt: inf.expiresAt,
    model: process.env.MODEL ?? 'llama-3.3-70b-versatile',
    capabilityId: CAPABILITY_ID,
    walletAddress: WALLET_ADDRESS,
    envelope: {
      eventClass: 1,
      actionType: 'noop.v1',
      actionSchemaVersion: 1,
      payloadCodec: 'bcs',
      payloadHash: new Array(32).fill(0),
      payloadBytes: [],
      actionSummary: 'replay-probe',
      actionOutcome: 2,
    },
    lineage: { intentId: new Array(16).fill(0), parentIntentId: null, executionId: 1 },
    wake: { triggeredByType: 1, triggeredByRef: null },
    replay: {
      modelVersion: process.env.MODEL ?? 'llama-3.3-70b-versatile',
      promptTemplateHash: new Array(32).fill(0),
      marketSnapshotHash: null,
      replayExtras: [],
    },
    proposal: { eventClass: 1, actionType: 'noop.v1', paymentAmount: '0' },
    actionCall: null,
  };
}

async function callExecute(body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const resp = await fetch(`${HOST_URL}/execute-capability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify(body),
  });
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: resp.status, data };
}

function mutateResultHash(hex: string): string {
  // Flip the last bit of the last hex nibble.
  const lastNibble = parseInt(hex.slice(-1), 16);
  return hex.slice(0, -1) + (lastNibble ^ 0x1).toString(16);
}

async function s10TamperResultHash(): Promise<boolean> {
  const requestId = Date.now() % 1_000_000;
  console.log(`\n=== S10: token tampering (requestId=${requestId}) ===`);
  const inf = await callInfer(requestId);
  console.log('[S10] /infer OK; token minted');
  const body = minimalCognitionBody(inf, requestId);
  body.resultHash = mutateResultHash(inf.resultHash);
  const r = await callExecute(body);
  console.log(`[S10] /execute-capability → HTTP ${r.status}`, r.data);
  if (r.status !== 403 || r.data.reason !== 'invalid') {
    console.error('[S10] FAIL: expected HTTP 403 with reason="invalid"');
    return false;
  }
  console.log('[S10] PASS');
  return true;
}

async function s11Replay(): Promise<boolean> {
  const requestId = Date.now() % 1_000_000;
  console.log(`\n=== S11: token replay (requestId=${requestId}) ===`);
  const inf = await callInfer(requestId);
  console.log('[S11] /infer OK; token minted');
  const body = minimalCognitionBody(inf, requestId);
  // First call. Result is don't-care; could 200 (cognition cycle ran) or
  // some 4xx from preflight semantics. Either way the nonce is now spent.
  const r1 = await callExecute(body);
  console.log(`[S11] First /execute-capability → HTTP ${r1.status}`);
  // Second call with same token — MUST fail with replay.
  const r2 = await callExecute(body);
  console.log(`[S11] Second /execute-capability → HTTP ${r2.status}`, r2.data);
  if (r2.status !== 403 || r2.data.reason !== 'replay') {
    console.error('[S11] FAIL: expected HTTP 403 with reason="replay"');
    return false;
  }
  console.log('[S11] PASS');
  return true;
}

async function main(): Promise<void> {
  console.log(`[smoke-token-replay] HOST_URL=${HOST_URL}`);
  let ok = true;
  ok = (await s10TamperResultHash()) && ok;
  ok = (await s11Replay()) && ok;
  if (!ok) {
    console.error('\n[smoke-token-replay] One or more checks FAILED');
    process.exit(2);
  }
  console.log('\n[smoke-token-replay] All checks PASSED');
}

main().catch((err) => {
  console.error('[smoke-token-replay] Unexpected error:', err);
  process.exit(1);
});
