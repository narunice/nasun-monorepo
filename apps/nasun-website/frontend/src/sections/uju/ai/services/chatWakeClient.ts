/**
 * Thin HTTP client for the chat-server's web chat-wake surface.
 *
 * Endpoint contract (chat-wake.ts mirror):
 *   POST /api/nasun-ai/chat/challenge  body: {wallet, agent, capabilityId}
 *     -> 200 {challenge, expiresAt}
 *   POST /api/nasun-ai/chat/session    body: {challenge, signature}
 *     -> 200 {chatToken, sid, expiresAt}
 *   POST /api/nasun-ai/chat/wake       body: {chatToken, message, idempotencyKey}
 *     -> 202 {jobId, status:'pending'|'error'}
 *   GET  /api/nasun-ai/chat/wake/:jobId  header: Authorization: Bearer <chatToken>
 *     -> 200 {jobId, status, outcome?, reason?, userMessage?}
 *
 * Errors: any non-2xx surfaces as `AgentChatApiError` with the server's
 * `error` code string preserved verbatim. Callers map that through
 * `chatWakeReasons.mapReason()` to a user-facing string + retryable flag.
 */

import type { WakeProposal } from '../types/chat';

const CHAT_SERVER_URL =
  (import.meta.env.VITE_CHAT_SERVER_URL as string | undefined) ?? 'https://nasun.io';

export class AgentChatApiError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  constructor(code: string, httpStatus: number) {
    super(code);
    this.name = 'AgentChatApiError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${CHAT_SERVER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new AgentChatApiError('client_network_error', 0);
  }
  return parseResponse<T>(res);
}

async function getWithAuth<T>(
  path: string,
  bearer: string,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${CHAT_SERVER_URL}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${bearer}` },
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new AgentChatApiError('client_network_error', 0);
  }
  return parseResponse<T>(res);
}

async function parseResponse<T>(res: Response): Promise<T> {
  // 202 from /wake carries a body too — accept both 200 and 202 as success.
  if (res.status === 200 || res.status === 202) {
    return (await res.json()) as T;
  }
  // Try to extract the server's structured error code. The chat-server
  // standardizes on `{error: <code>}`. Any unparseable body collapses to a
  // status-derived sentinel so the UI still gets a non-empty code.
  let code = '';
  try {
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body.error === 'string') code = body.error;
  } catch {
    // ignore — body wasn't JSON, fall through to status code
  }
  if (!code) code = `http_${res.status}`;
  throw new AgentChatApiError(code, res.status);
}

// --- /challenge ---

export interface ChallengePayload {
  wallet: string;
  agent: string;
  capabilityId: string;
}

export interface ChallengeResponse {
  challenge: string;
  expiresAt: number;
}

export function postChatChallenge(
  payload: ChallengePayload,
  signal?: AbortSignal,
): Promise<ChallengeResponse> {
  return postJson<ChallengeResponse>('/api/nasun-ai/chat/challenge', payload, signal);
}

// --- /session ---

export interface SessionPayload {
  challenge: string;
  signature: string;
}

export interface SessionResponse {
  chatToken: string;
  sid: string;
  expiresAt: number;
}

export function postChatSession(
  payload: SessionPayload,
  signal?: AbortSignal,
): Promise<SessionResponse> {
  return postJson<SessionResponse>('/api/nasun-ai/chat/session', payload, signal);
}

// --- /wake ---

export interface WakePayload {
  chatToken: string;
  message: string;
  idempotencyKey: string;
}

export interface WakeResponse {
  jobId: string;
  status: 'pending' | 'error' | 'done';
}

export function postChatWake(payload: WakePayload, signal?: AbortSignal): Promise<WakeResponse> {
  return postJson<WakeResponse>('/api/nasun-ai/chat/wake', payload, signal);
}

// --- GET /wake/:jobId ---

export interface WakeOutcome {
  ok: boolean;
  status?: string;
  summary?: string;
  proposal?: WakeProposal;
}

export interface WakePollResponse {
  jobId: string;
  status: 'pending' | 'done' | 'error';
  outcome?: WakeOutcome;
  reason?: string;
  userMessage?: string;
}

export function getChatWakeStatus(
  jobId: string,
  bearer: string,
  signal?: AbortSignal,
): Promise<WakePollResponse> {
  return getWithAuth<WakePollResponse>(`/api/nasun-ai/chat/wake/${jobId}`, bearer, signal);
}

// --- idempotency key ---

// Crockford alphabet (no I/L/O/U) — same as ULID and the chat-server's
// jobId regex. We don't need timestamp ordering on the key itself (server
// stores its own ULID jobId), so a plain random 26-char Crockford string is
// enough and fits the server's `^[A-Za-z0-9_-]{8,64}$` idempotency regex.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function mintIdempotencyKey(): string {
  const bytes = new Uint8Array(26);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += CROCKFORD[bytes[i] % 32];
  }
  return out;
}

export const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isUlid(s: string): boolean {
  return ULID_REGEX.test(s);
}
