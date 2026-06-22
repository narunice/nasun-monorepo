// In-memory nonce store for the address-book challenge/verify anti-replay flow. Replaces the DynamoDB
// recordType=NONCE rows the lambda used (handlers/addressBook.ts createChallenge/consumeNonce).
//
// Why in-memory (decision 2026-06-22): the box is a single instance (single systemd unit -- the same
// single-instance invariant the bots rely on), so no cross-node nonce sharing is needed. A nonce is ephemeral
// (300s TTL); on a service restart the in-flight nonces are lost and the client simply re-requests a challenge
// (harmless). This keeps challenge/verify entirely off PG (no ephemeral writes polluting the address_books
// mirror, and the writer role is needed ONLY for POST /address-book), and consume is atomic for free: the JS
// event loop is single-threaded, so get()+delete() with no await between them cannot interleave (no TOCTOU).

const NONCE_TTL_SECONDS = 300; // 5 minutes, parity with the lambda
const SWEEP_INTERVAL_MS = 60_000;
const MAX_NONCES = 100_000; // backstop against unbounded growth from un-consumed challenges

export interface NonceRecord {
  boundWalletAddress: string;
  message: string;
  expiresAt: number; // unix seconds
}

const store = new Map<string, NonceRecord>();

export function nonceTtlSeconds(): number {
  return NONCE_TTL_SECONDS;
}

// Store a freshly created nonce. expiresAt is computed by the caller (parity with the lambda's
// Math.floor(Date.now()/1000) + NONCE_TTL_SECONDS) and passed in via the record.
export function putNonce(nonce: string, record: NonceRecord): void {
  // Backstop: if the map is somehow saturated (flood of un-consumed challenges), drop the oldest expired
  // entries first, then refuse new ones rather than grow without bound.
  if (store.size >= MAX_NONCES) {
    sweep();
    if (store.size >= MAX_NONCES) {
      console.warn('[address-book] nonce store saturated; dropping new challenge');
      return;
    }
  }
  store.set(nonce, record);
}

// Atomically retrieve and delete a nonce (prevents replay). Returns null if not found or expired. get()+delete()
// run synchronously with no await between, so this is a single uninterruptible step on the JS event loop.
export function consumeNonce(nonce: string): NonceRecord | null {
  const record = store.get(nonce);
  if (!record) return null;
  store.delete(nonce);
  if (record.expiresAt < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return record;
}

function sweep(): void {
  const now = Math.floor(Date.now() / 1000);
  for (const [nonce, record] of store) {
    if (record.expiresAt < now) store.delete(nonce);
  }
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startNonceSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
  // Do not keep the process alive solely for the sweeper.
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
}

export function stopNonceSweeper(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}
