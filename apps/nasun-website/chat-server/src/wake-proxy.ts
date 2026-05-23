// HTTP forwarder from chat-server → agent-runner /wake.
//
// Why this file is its own module:
//   - Both the Telegram path (baram-telegram.ts) and the web chat-wake path
//     (chat-wake.ts) need to call the same runtime endpoint with the same
//     HMAC scheme. Centralizing the helper here keeps the byte-for-byte
//     wire contract in one place.
//
// HMAC scheme (MUST match nasun-ai-runtime/src/jwt-verify.ts:verifyHmac):
//   - Body is JSON-stringified once.
//   - HMAC-SHA256 over the exact UTF-8 bytes of that JSON string.
//   - Sent as hex in the X-HMAC header.
//
// Callers MUST pass a fully-formed WakeBody object; this helper performs the
// single JSON.stringify pass internally so the bytes signed and the bytes
// transmitted are identical. Do not mutate the body after passing it in.

import { createHmac } from 'node:crypto';
import type { Proposal } from '@nasun/baram-sdk';
import { describeFetchError } from './fetch-error.js';

export const WAKE_SOFT_NOTICE_MS = 30_000;
export const WAKE_HARD_TIMEOUT_MS = 120_000;

export interface WakeBody {
  job_id: string;
  jwt: string;
  trigger_type: 'user_message' | 'manual';
  intent_id: string;
  parent_intent_id?: string;
  message?: string;
}

export interface WakeResult {
  ok: boolean;
  status?: string;
  reason?: string;
  summary?: string;
  proposal?: Proposal;
  error?: string;
}

function getHmacSecret(): Buffer {
  const raw = process.env.BARAM_CHAT_SERVER_HMAC_SECRET;
  if (!raw || raw.length < 32) throw new Error('BARAM_CHAT_SERVER_HMAC_SECRET missing or too short');
  return Buffer.from(raw, 'hex');
}

function signBody(bodyJson: string): string {
  return createHmac('sha256', getHmacSecret()).update(bodyJson, 'utf8').digest('hex');
}

export async function forwardToWake(
  wakeUrl: string,
  body: WakeBody,
  timeoutMs: number = WAKE_HARD_TIMEOUT_MS,
): Promise<WakeResult> {
  const bodyJson = JSON.stringify(body);
  const hmac = signBody(bodyJson);
  try {
    const res = await fetch(wakeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HMAC': hmac,
      },
      body: bodyJson,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `wake_http_${res.status}: ${text.slice(0, 100)}` };
    }
    const json = (await res.json()) as Record<string, unknown>;
    const reason = typeof json.reason === 'string' ? json.reason : undefined;
    const status = typeof json.status === 'string' ? json.status : undefined;
    return {
      ok: json.ok === true,
      status,
      reason,
      summary: typeof json.summary === 'string' ? json.summary : undefined,
      proposal: json.proposal != null ? (json.proposal as Proposal) : undefined,
      error: json.ok === true ? undefined : reason,
    };
  } catch (err) {
    return { ok: false, error: describeFetchError(err) };
  }
}
