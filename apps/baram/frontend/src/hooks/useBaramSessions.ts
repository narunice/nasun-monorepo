// Baram (Nasun AI) Telegram session management hooks.
//
// Two-step wallet sig protocol (Plan D §A1, baram-telegram-routes.ts):
//   1. POST /api/baram/telegram/challenge  -> challenge string
//   2. POST /api/baram/telegram/link-session|revoke-session|sessions
//      Body: { challenge, signature }
//
// signer.signPersonal() produces the Sui personal-message signature that
// baram-session's verifyPersonalMessageSignature() consumes.

import { useState, useCallback, useEffect } from 'react';
import { useSigner } from '@nasun/wallet';

const CHAT_SERVER_URL =
  (import.meta.env.VITE_CHAT_SERVER_URL as string | undefined) ?? 'https://nasun.io';

export interface BaramSession {
  sid: string;
  wallet: string;
  agent: string;
  capabilityId: string;
  tgUserId: string | null;
  expiresAt: number;
  revokedAt: number | null;
  createdAt: number;
}

async function fetchChallenge(
  wallet: string,
  purpose: 'link' | 'revoke' | 'list',
  extra?: { agent?: string; capabilityId?: string; sid?: string },
): Promise<string> {
  const res = await fetch(`${CHAT_SERVER_URL}/api/baram/telegram/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, purpose, ...extra }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(typeof err.error === 'string' ? err.error : `challenge failed: ${res.status}`);
  }
  const data = await res.json() as { challenge: string };
  return data.challenge;
}

// ---------- Link session ----------

export interface LinkSessionResult {
  sid: string;
  expiresAt: number;
  deepLink: string;
}

export function useLinkSession() {
  const { signer, address } = useSigner();
  const [status, setStatus] = useState<'idle' | 'signing' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LinkSessionResult | null>(null);

  const link = useCallback(
    async (agent: string, capabilityId: string): Promise<LinkSessionResult | null> => {
      if (!signer || !address) {
        setError('Wallet not connected');
        return null;
      }
      setStatus('signing');
      setError(null);
      try {
        const challenge = await fetchChallenge(address, 'link', { agent, capabilityId });
        const msgBytes = new TextEncoder().encode(challenge);
        const { signature } = await signer.signPersonal(msgBytes);

        setStatus('submitting');
        const res = await fetch(`${CHAT_SERVER_URL}/api/baram/telegram/link-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challenge, signature }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as Record<string, unknown>;
          throw new Error(typeof err.error === 'string' ? err.error : `link failed: ${res.status}`);
        }
        const data = await res.json() as LinkSessionResult;
        setResult(data);
        setStatus('success');
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setError(msg);
        setStatus('error');
        return null;
      }
    },
    [signer, address],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setResult(null);
  }, []);

  return { link, status, error, result, reset };
}

// ---------- List sessions ----------

export function useBaramSessions() {
  const { signer, address } = useSigner();
  const [sessions, setSessions] = useState<BaramSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!signer || !address) return;
    setLoading(true);
    setError(null);
    try {
      const challenge = await fetchChallenge(address, 'list');
      const msgBytes = new TextEncoder().encode(challenge);
      const { signature } = await signer.signPersonal(msgBytes);

      const res = await fetch(`${CHAT_SERVER_URL}/api/baram/telegram/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge, signature }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(typeof err.error === 'string' ? err.error : `list failed: ${res.status}`);
      }
      const data = await res.json() as { sessions: BaramSession[] };
      setSessions(data.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [signer, address]);

  // No auto-load on mount: listing sessions requires a wallet sig each time.
  // Callers trigger load() explicitly via a user action.

  return { sessions, loading, error, reload: load };
}

// ---------- Revoke session ----------

export function useRevokeSession() {
  const { signer, address } = useSigner();
  const [revoking, setRevoking] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const revoke = useCallback(
    async (sid: string): Promise<boolean> => {
      if (!signer || !address) return false;
      setRevoking((prev) => new Set([...prev, sid]));
      setError(null);
      try {
        const challenge = await fetchChallenge(address, 'revoke', { sid });
        const msgBytes = new TextEncoder().encode(challenge);
        const { signature } = await signer.signPersonal(msgBytes);

        const res = await fetch(`${CHAT_SERVER_URL}/api/baram/telegram/revoke-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challenge, signature }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as Record<string, unknown>;
          throw new Error(typeof err.error === 'string' ? err.error : `revoke failed: ${res.status}`);
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Revoke failed');
        return false;
      } finally {
        setRevoking((prev) => {
          const next = new Set(prev);
          next.delete(sid);
          return next;
        });
      }
    },
    [signer, address],
  );

  return { revoke, revoking, error };
}
