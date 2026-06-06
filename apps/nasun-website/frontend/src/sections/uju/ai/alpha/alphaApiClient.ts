/**
 * Browser client for the chat-server alpha slot/waitlist API.
 *
 * Endpoints (PR-2 backend):
 *   - POST /api/nasun-ai/alpha/challenge   purpose: 'alpha-join' | 'alpha-leave'
 *   - POST /api/nasun-ai/alpha/join        body: { challenge, signature }
 *   - POST /api/nasun-ai/alpha/leave       body: { challenge, signature }
 *   - GET  /api/nasun-ai/alpha/status?wallet=0x...
 *   - GET  /api/nasun-ai/alpha/capacity    (PR-1, kept for compatibility)
 *   - GET  /api/nasun-ai/alpha/health      (PR-1)
 *
 * Mirrors the structure of agentVaultClient.ts — same SignerLike contract,
 * same error code surfacing pattern (caller switches on `code`).
 */

const CHAT_SERVER_URL =
  (import.meta.env.VITE_CHAT_SERVER_URL as string | undefined) ?? 'https://nasun.io';

export type AlphaPurpose = 'alpha-join' | 'alpha-leave' | 'alpha-tg-link';

export type AlphaUserState =
  | 'none'
  | 'waiting'
  | 'invited'
  | 'active'
  | 'paused'
  | 'expired'
  | 'exempt';

export interface AlphaCapacity {
  used: number;
  total: number;
  available: number;
  /**
   * Waitlist members in their claim window (promoted, not yet activated).
   * They hold a pending slot, so available = total - used - invited. Optional
   * for forward-compat: a chat-server without this field omits it.
   */
  invited?: number;
  /** Agent session length in hours (server config). Optional for forward-compat. */
  ttl_hours?: number;
  queue_depth: number;
  schema_ready: boolean;
  gate_enabled: boolean;
}

export interface AlphaPerWallet {
  /** Non-exempt active agents already owned by this wallet. */
  activeCount: number;
  /** Server-side PER_WALLET_CAP. Treat as authoritative; do not duplicate the constant on the client. */
  cap: number;
  /** activeCount < cap (or wallet is slot-exempt, or gate is disabled). */
  canCreate: boolean;
}

export interface AlphaStatusResponse {
  state: AlphaUserState;
  /** null until the server has checked Genesis Pass at least once for this wallet. */
  eligible: boolean | null;
  agent_address?: string;
  expires_at?: number | null;
  warned?: boolean;
  invite_expires_at?: number | null;
  joined_at?: number;
  queue_position?: number;
  queue_depth?: number;
  paused_at?: number | null;
  /**
   * Whether invite/warn DMs can reach this wallet (live agent session OR an
   * alpha Telegram binding). Populated only for waitlist states. Optional for
   * forward compatibility: when absent (older chat-server) the frontend
   * suppresses the "Connect Telegram" CTA rather than nagging.
   */
  tg_bound?: boolean;
  /**
   * On the 'invited' state: true when the wallet has a paused agent waiting to
   * resume (returning tester, one-tap Resume) rather than a fresh setup.
   * (Test-window length is in capacity.ttl_hours.)
   */
  resume?: boolean;
  capacity: AlphaCapacity;
  /**
   * Per-wallet cap snapshot. Optional for forward compatibility: a chat-server
   * deployed without the perWallet patch will omit it, in which case the
   * frontend falls back to its prior behavior (no extra block; vault upload
   * still defends at submit time).
   */
  perWallet?: AlphaPerWallet;
}

interface SignerLike {
  signPersonal(bytes: Uint8Array): Promise<{ signature: string }>;
}

export class AlphaApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${CHAT_SERVER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const code = typeof err.error === 'string' ? err.error : `http_${res.status}`;
    throw new AlphaApiError(code, res.status);
  }
  return (await res.json()) as T;
}

async function fetchAlphaChallenge(wallet: string, purpose: AlphaPurpose): Promise<string> {
  const { challenge } = await postJson<{ challenge: string; expiresAt: number }>(
    '/api/nasun-ai/alpha/challenge',
    { wallet, purpose },
  );
  return challenge;
}

export interface AlphaJoinResult {
  ok: true;
  state: AlphaUserState;
  joined_at: number;
  invite_expires_at: number | null;
}

/** Sign + POST /alpha/join. Genesis Pass eligibility is checked server-side. */
export async function joinAlphaWaitlist(
  signer: SignerLike,
  wallet: string,
): Promise<AlphaJoinResult> {
  const challenge = await fetchAlphaChallenge(wallet, 'alpha-join');
  const { signature } = await signer.signPersonal(new TextEncoder().encode(challenge));
  return postJson<AlphaJoinResult>('/api/nasun-ai/alpha/join', { challenge, signature });
}

export interface AlphaLeaveResult {
  ok: true;
  removed: boolean;
}

/** Sign + POST /alpha/leave. Idempotent — removed=false means no waitlist row. */
export async function leaveAlphaWaitlist(
  signer: SignerLike,
  wallet: string,
): Promise<AlphaLeaveResult> {
  const challenge = await fetchAlphaChallenge(wallet, 'alpha-leave');
  const { signature } = await signer.signPersonal(new TextEncoder().encode(challenge));
  return postJson<AlphaLeaveResult>('/api/nasun-ai/alpha/leave', { challenge, signature });
}

export interface AlphaTgLinkResult {
  ok: true;
  /** `https://t.me/<bot>?start=alpha_<token>` — open to bind Telegram. */
  deepLink: string;
  expiresAt: number;
}

/**
 * Sign + POST /alpha/tg-link. Returns a Telegram deep link the caller should
 * open; the bot's /start handler then binds this wallet to the Telegram
 * account so invite/warn DMs reach a waitlist user with no agent session yet.
 */
export async function requestAlphaTgLink(
  signer: SignerLike,
  wallet: string,
): Promise<AlphaTgLinkResult> {
  const challenge = await fetchAlphaChallenge(wallet, 'alpha-tg-link');
  const { signature } = await signer.signPersonal(new TextEncoder().encode(challenge));
  return postJson<AlphaTgLinkResult>('/api/nasun-ai/alpha/tg-link', { challenge, signature });
}

/** GET /alpha/status?wallet=. Public read — no signature required. */
export async function fetchAlphaStatus(wallet: string): Promise<AlphaStatusResponse> {
  const res = await fetch(
    `${CHAT_SERVER_URL}/api/nasun-ai/alpha/status?wallet=${encodeURIComponent(wallet)}`,
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const code = typeof err.error === 'string' ? err.error : `http_${res.status}`;
    throw new AlphaApiError(code, res.status);
  }
  return (await res.json()) as AlphaStatusResponse;
}

export async function fetchAlphaCapacity(): Promise<AlphaCapacity> {
  const res = await fetch(`${CHAT_SERVER_URL}/api/nasun-ai/alpha/capacity`);
  if (!res.ok) throw new AlphaApiError(`http_${res.status}`, res.status);
  return (await res.json()) as AlphaCapacity;
}
