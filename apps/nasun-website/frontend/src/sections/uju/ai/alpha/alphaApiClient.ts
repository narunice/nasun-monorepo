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

export type AlphaPurpose = 'alpha-join' | 'alpha-leave';

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
  queue_depth: number;
  schema_ready: boolean;
  gate_enabled: boolean;
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
  capacity: AlphaCapacity;
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
