/**
 * Smoke S(B.6): min_out floor enforcement (C3-v2c HIGH #2 fix).
 *
 * Crafts an /execute-capability body that mimics a compliant trade.swap.v1
 * BUY but sets `actionCall.args[3] = u64(0)` (min_out = accept any output).
 *
 * Without the C3-v2c fix the host would forward this PTB and the trader
 * would land an arbitrarily-bad fill (price-impact attack via a frontrun).
 * The fix re-quotes the pool via devInspect, derives a slippage-bps floor,
 * and refuses bodies whose min_out is below that floor.
 *
 * Expected: HTTP 400 with `error: "actionCall min_out below slippage floor"`.
 *
 * Required env:
 *   HOST_URL                 (e.g. http://localhost:3000)
 *   HOST_API_KEY             api key the host expects (BARAM_API_KEY)
 *   CAPABILITY_ID            shared cap id minted by atomic setup
 *   ESCROW_ID                shared escrow id paired to the cap
 *   WALLET_ADDRESS           cap.owner address
 *   PADO_DEEPBOOK_PACKAGE_ID
 *   PADO_NBTC_NUSDC_POOL
 *   NBTC_TYPE                output asset (BUY)
 *   NUSDC_TYPE               input asset (BUY)
 *   MODEL                    optional, default llama-3.3-70b-versatile
 *
 * Usage:
 *   npx tsx --env-file=../executor-nitro/.env smoke-min-out-floor.ts
 */

const HOST_URL = required('HOST_URL');
const API_KEY = required('HOST_API_KEY');
const CAPABILITY_ID = required('CAPABILITY_ID');
const ESCROW_ID = required('ESCROW_ID');
const WALLET_ADDRESS = required('WALLET_ADDRESS');
const PADO_PKG = required('PADO_DEEPBOOK_PACKAGE_ID');
const POOL = required('PADO_NBTC_NUSDC_POOL');
const NBTC = required('NBTC_TYPE');
const NUSDC = required('NUSDC_TYPE');
const MODEL = process.env.MODEL ?? 'llama-3.3-70b-versatile';

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`[smoke-min-out-floor] FATAL: env "${key}" is unset.`);
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
    model: MODEL,
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

function u64LeBase64(v: bigint): string {
  const out = Buffer.alloc(8);
  let x = v;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out.toString('base64');
}

function buildExecBody(inf: InferOk, requestId: number, minOut: bigint) {
  const inputAmount = '2000000'; // 2 NUSDC raw
  return {
    requestId,
    resultHash: inf.resultHash,
    executionTimeMs: inf.executionTimeMs,
    spendToken: inf.spendToken,
    nonce: inf.nonce,
    expiresAt: inf.expiresAt,
    model: MODEL,
    capabilityId: CAPABILITY_ID,
    walletAddress: WALLET_ADDRESS,
    envelope: {
      eventClass: 2,
      actionType: 'trade.swap.v1',
      actionSchemaVersion: 1,
      payloadCodec: 'bcs',
      payloadHash: new Array(32).fill(0),
      payloadBytes: [],
      actionSummary: 'min_out-floor-probe',
      actionOutcome: 1,
    },
    lineage: { intentId: new Array(16).fill(0), parentIntentId: null, executionId: 1 },
    wake: { triggeredByType: 1, triggeredByRef: null },
    replay: {
      modelVersion: MODEL,
      promptTemplateHash: new Array(32).fill(0),
      marketSnapshotHash: null,
      replayExtras: [],
    },
    proposal: {
      eventClass: 2,
      actionType: 'trade.swap.v1',
      paymentAmount: '0',
      exec: {
        targetPackage: PADO_PKG,
        module: 'pool',
        fn: 'swap_exact_quote_for_base',
        inputAssetType: NUSDC,
        outputAssetType: NBTC,
        inputAmount,
        maxSlippageBps: 100,
        poolId: POOL,
      },
    },
    escrow: {
      objectId: ESCROW_ID,
      initialSharedVersion: '0',
      capabilityId: CAPABILITY_ID,
    },
    spend: { coinAssetType: NUSDC, amount: inputAmount },
    actionCall: {
      targetPackage: PADO_PKG,
      module: 'pool',
      fn: 'swap_exact_quote_for_base',
      typeArgs: [NBTC, NUSDC],
      args: [
        // arg 0: pool object
        { kind: 'object', id: POOL },
        // arg 1: input coin (pipe from Cmd 0)
        { kind: 'pipe', from: 'withdraw_coin' },
        // arg 2: deep coin (pipe from Cmd 1)
        { kind: 'pipe', from: 'zero_deep' },
        // arg 3: min_out — the attack vector (wire form: base64-encoded u64-LE)
        { kind: 'pure', bytes: u64LeBase64(minOut) },
        // arg 4: clock
        { kind: 'object', id: '0x6' },
      ],
    },
  };
}

async function main(): Promise<void> {
  console.log(`[smoke-min-out-floor] HOST_URL=${HOST_URL}`);

  const requestId = Date.now() % 1_000_000;
  console.log(`\n=== B.6: min_out=0 attack (requestId=${requestId}) ===`);
  const inf = await callInfer(requestId);
  console.log('[B.6] /infer OK; token minted');

  const body = buildExecBody(inf, requestId, 0n);
  // The host's express.json() middleware needs Uint8Array bytes serialized;
  // sending number[] is fine because JSON parses to a regular array and the
  // host coerces to Buffer/Uint8Array internally for the pure-arg path.
  // Replace the args[3].bytes with explicit number[] form for JSON wire.
  const wireBody = JSON.parse(
    JSON.stringify(body, (_k, v) => (v instanceof Uint8Array ? Array.from(v) : v)),
  );

  const resp = await fetch(`${HOST_URL}/execute-capability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify(wireBody),
  });
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  console.log(`[B.6] /execute-capability → HTTP ${resp.status}`, data);

  if (resp.status !== 400 || data.error !== 'actionCall min_out below slippage floor') {
    console.error('[B.6] FAIL: expected HTTP 400 with error="actionCall min_out below slippage floor"');
    process.exit(2);
  }
  console.log('[B.6] PASS: min_out=0 rejected by slippage floor');
  console.log(`     floorMinOut=${data.floorMinOut} expectedOut=${data.expectedOut} slippageBps=${data.slippageBps}`);
}

main().catch((err) => {
  console.error('[smoke-min-out-floor] Unexpected error:', err);
  process.exit(1);
});
