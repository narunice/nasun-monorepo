/**
 * PR2.B — Browser client for the chat-server agent-vault API.
 *
 * Wraps the challenge + wallet-sig protocol used by:
 *   - POST /api/nasun-ai/vault/challenge   (mint a sig challenge)
 *   - POST /api/nasun-ai/vault/upload      (upload bech32 keypair → SSM)
 *   - DELETE /api/nasun-ai/vault/agent/:address
 *   - POST /api/nasun-ai/vault/agent/:address/restore
 *   - GET /api/nasun-ai/vault/agent/:address/status
 *
 * The plaintext keypair is sent in the upload body over HTTPS once. The
 * server immediately writes it to SSM SecureString and never logs it
 * (server-side `redactedPayload` helper). The browser side discards its
 * reference after the upload resolves.
 */

import { sha256 } from '@noble/hashes/sha2';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const CHAT_SERVER_URL =
  (import.meta.env.VITE_CHAT_SERVER_URL as string | undefined) ?? 'https://nasun.io';

export type VaultPurpose = 'vault-upload' | 'vault-delete' | 'vault-restore';

export type VaultState = 'active' | 'inactive' | 'grace' | 'not_vaulted';

export interface VaultStatusResponse {
  state: VaultState;
  graceEndsAt: number | null;
}

export interface VaultUploadResult {
  ok: true;
  paramName: string;
  pm2Name: string;
  wakePort: number;
}

export interface VaultDeleteResult {
  ok: true;
  recoveryWindowEndsAt: number;
}

export interface VaultRestoreResult {
  ok: true;
  wakePort: number;
}

function pubkeyHashHex(pubkeyBytes: Uint8Array): string {
  const digest = sha256(pubkeyBytes);
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
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
    throw Object.assign(new Error(code), { code, status: res.status });
  }
  return (await res.json()) as T;
}

async function deleteJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${CHAT_SERVER_URL}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const code = typeof err.error === 'string' ? err.error : `http_${res.status}`;
    throw Object.assign(new Error(code), { code, status: res.status });
  }
  return (await res.json()) as T;
}

interface SignerLike {
  signPersonal(bytes: Uint8Array): Promise<{ signature: string }>;
}

async function fetchChallenge(args: {
  ownerWallet: string;
  agentAddress: string;
  purpose: VaultPurpose;
  pubkeyHash?: string;
  capabilityId?: string;
}): Promise<string> {
  const { challenge } = await postJson<{ challenge: string; expiresAt: number }>(
    '/api/nasun-ai/vault/challenge',
    args,
  );
  return challenge;
}

/** Activate an agent on the server vault. The keypair is sent once over
 *  HTTPS and immediately written to SSM by the server. The caller should
 *  forget `keypair` as soon as this resolves. */
export async function uploadAgentKeyToVault(
  signer: SignerLike,
  ownerWallet: string,
  agentAddress: string,
  capabilityId: string,
  keypair: Ed25519Keypair,
  profileId?: string | null,
): Promise<VaultUploadResult> {
  const pubkeyHash = pubkeyHashHex(keypair.getPublicKey().toRawBytes());
  const challenge = await fetchChallenge({
    ownerWallet,
    agentAddress,
    purpose: 'vault-upload',
    pubkeyHash,
    capabilityId,
  });
  const { signature } = await signer.signPersonal(new TextEncoder().encode(challenge));
  return postJson<VaultUploadResult>('/api/nasun-ai/vault/upload', {
    challenge,
    signature,
    agentSecretKey: keypair.getSecretKey(),
    ...(profileId ? { profileId } : {}),
  });
}

export async function deactivateAgent(
  signer: SignerLike,
  ownerWallet: string,
  agentAddress: string,
): Promise<VaultDeleteResult> {
  const challenge = await fetchChallenge({
    ownerWallet,
    agentAddress,
    purpose: 'vault-delete',
  });
  const { signature } = await signer.signPersonal(new TextEncoder().encode(challenge));
  return deleteJson<VaultDeleteResult>(
    `/api/nasun-ai/vault/agent/${agentAddress.toLowerCase()}`,
    { challenge, signature },
  );
}

export async function restoreAgent(
  signer: SignerLike,
  ownerWallet: string,
  agentAddress: string,
): Promise<VaultRestoreResult> {
  const challenge = await fetchChallenge({
    ownerWallet,
    agentAddress,
    purpose: 'vault-restore',
  });
  const { signature } = await signer.signPersonal(new TextEncoder().encode(challenge));
  return postJson<VaultRestoreResult>(
    `/api/nasun-ai/vault/agent/${agentAddress.toLowerCase()}/restore`,
    { challenge, signature },
  );
}

export async function fetchVaultStatus(agentAddress: string): Promise<VaultStatusResponse> {
  const res = await fetch(
    `${CHAT_SERVER_URL}/api/nasun-ai/vault/agent/${agentAddress.toLowerCase()}/status`,
  );
  if (!res.ok) {
    throw new Error(`status fetch failed: ${res.status}`);
  }
  return (await res.json()) as VaultStatusResponse;
}
