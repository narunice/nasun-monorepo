/**
 * PR2.B — ActivateAgentModal: upload the encrypted agent keypair to the
 * server vault (AWS SSM Parameter Store) so the chat-server can spawn a
 * dedicated PM2 runtime process for this agent.
 *
 * Flow:
 *   1. User enters their agent passphrase (same one set at agent creation).
 *   2. We decrypt the bech32 keypair locally (in browser) via exportAgentSecrets.
 *   3. Defense-in-depth: assert decrypted key derives the expected agent address.
 *   4. Call agentVaultClient.uploadAgentKeyToVault — this fetches a sig
 *      challenge, signs with the user's wallet, then sends keypair + signature.
 *   5. Server verifies sig + chain ownership, writes to SSM, spawns PM2.
 *
 * The plaintext keypair lives in the browser only between step 2 and step 4,
 * and traverses the wire once over HTTPS in step 4. The server never logs it.
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { useSigner } from '@nasun/wallet';
import { exportAgentSecrets } from '../../services/agentKeyStorage';
import { uploadAgentKeyToVault } from '../../services/agentVaultClient';
import { authorizeAgentOnChain } from '../../services/agentAuthorizeOnChain';

interface ActivateAgentModalProps {
  agentId: string;
  agentAddress: string;
  agentName: string;
  capabilityId: string;
  walletAddress: string;
  onActivated: () => void;
  onClose: () => void;
}

const inputBase =
  'w-full px-3 py-2 text-sm rounded-lg bg-uju-bg border border-uju-border/60 text-white placeholder:text-uju-secondary/60 focus:outline-none focus:border-pado-2 transition-colors';

export function ActivateAgentModal({
  agentId,
  agentAddress,
  agentName,
  capabilityId,
  walletAddress,
  onActivated,
  onClose,
}: ActivateAgentModalProps) {
  const { signer } = useSigner();
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'decrypting' | 'signing' | 'uploading' | 'authorizing'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setPassphrase('');
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !busy) handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose, busy]);

  const handleActivate = async () => {
    setError(null);
    if (!signer) { setError('Wallet not connected.'); return; }
    if (!passphrase) { setError('Enter your agent passphrase.'); return; }
    if (!capabilityId) { setError('This agent has no on-chain capability id; activation requires it.'); return; }
    setBusy(true);
    try {
      setPhase('decrypting');
      const exported = await exportAgentSecrets(agentId, walletAddress, passphrase);
      if (!exported) {
        setError('No encrypted key found in browser storage for this agent.');
        return;
      }
      if (exported.derivedAddress.toLowerCase() !== agentAddress.toLowerCase()) {
        setError('Decrypted key derives a different address. Aborting.');
        return;
      }
      const keypair = Ed25519Keypair.fromSecretKey(exported.secretKey);
      setPhase('signing');
      // signer.signPersonal is invoked inside uploadAgentKeyToVault after challenge fetch.
      setPhase('uploading');
      await uploadAgentKeyToVault(signer, walletAddress, agentAddress, capabilityId, keypair);

      // On-chain delegation: lets the spawned agent call
      // `capability::set_pending_proposal` with its own keypair (needed
      // for the chat-message proposal flow's race-lock). The cap was
      // created before delegation support shipped, so this is a one-time
      // catch-up signature. Non-fatal — vault upload already committed,
      // so the agent boots either way; without delegation it just can't
      // surface inline Confirm/Cancel keyboards.
      setPhase('authorizing');
      try {
        await authorizeAgentOnChain(signer, walletAddress, capabilityId, agentAddress);
      } catch (err) {
        console.warn(
          '[ActivateAgentModal] authorizeAgentOnChain failed (non-fatal):',
          err instanceof Error ? err.message : err,
        );
      }

      onActivated();
      handleClose();
    } catch (err) {
      const code = (err as { code?: string }).code;
      const msg = mapErrorCode(code) ?? (err instanceof Error ? err.message : 'unknown');
      setError(msg);
    } finally {
      setBusy(false);
      setPhase('idle');
    }
  };

  const phaseLabel: Record<typeof phase, string> = {
    idle: 'Activate on server',
    decrypting: 'Decrypting key...',
    signing: 'Signing with wallet...',
    uploading: 'Uploading to vault...',
    authorizing: 'Authorizing agent on-chain...',
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) handleClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="activate-agent-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-uju-card border border-uju-border/60 shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-uju-border/60">
          <h2 id="activate-agent-title" className="text-base font-semibold text-white">
            Activate {agentName} on server
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="p-1.5 rounded-lg text-uju-secondary hover:bg-uju-bg/60 transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 text-sm text-amber-200">
            <p className="font-medium">Your encrypted key will be stored on Nasun servers.</p>
            <p className="mt-1 text-amber-200/80">
              We use AWS SSM Parameter Store with KMS encryption at rest. The runtime fetches it on
              process startup. You can deactivate any time, with a 7-day recovery window.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="activate-passphrase" className="text-sm text-uju-secondary">
              Agent passphrase
            </label>
            <input
              id="activate-passphrase"
              type="password"
              autoComplete="current-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void handleActivate(); }}
              placeholder="At least 6 characters"
              className={inputBase}
              disabled={busy}
            />
            <p className="text-sm text-uju-secondary/70">
              Used in your browser to decrypt the key before upload. Never sent to the server.
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={busy || !passphrase}
            onClick={() => void handleActivate()}
            className="w-full py-2.5 rounded-xl bg-pado-2 text-uju-bg text-sm font-medium hover:bg-pado-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {phaseLabel[phase]}
          </button>

          <p className="text-sm text-uju-secondary/70 text-center">
            First cycle starts within ~5 minutes after activation.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function mapErrorCode(code: string | undefined): string | null {
  switch (code) {
    case 'not_capability_owner': return 'Your wallet does not own this agent on chain.';
    case 'expired_challenge':
    case 'expired': return 'Challenge expired. Please retry.';
    case 'bad_signature': return 'Signature verification failed.';
    case 'address_mismatch': return 'Decrypted key does not match this agent address.';
    case 'pubkey_hash_mismatch': return 'Key pubkey hash mismatch.';
    case 'invalid_secret_format': return 'Stored key has an unexpected format.';
    case 'already_active': return 'This agent is already activated.';
    case 'setup1_legacy_running': return 'Stop the legacy nasun-ai-runtime process before activating this agent.';
    case 'rate_limited': return 'Too many requests. Wait a minute and retry.';
    case 'spawn_failed': return 'Server failed to start the agent process. Try Deactivate then Activate again.';
    case 'vault_store_failed': return 'Server vault write failed.';
    // Public alpha gate codes (chat-server alpha-guards.ts). Surfaced when
    // a non-invited user reaches Activate. The activation modal is a
    // "do it now" surface, so the messages describe the next concrete
    // action rather than the underlying mechanics.
    case 'not_invited':
      return 'Public alpha is full. Open the AI tab to join the waitlist; your agent activates automatically when a slot opens.';
    case 'invite_expired':
      return 'Your alpha slot invite expired. Re-join the waitlist on the AI tab to try again.';
    case 'alpha_full':
      return 'All public alpha slots are taken right now. Try again in a moment, or join the waitlist to be promoted automatically.';
    case 'per_wallet_cap_reached':
      return 'You already have an active alpha agent on this wallet. Deactivate it first if you want to swap to a different agent.';
    case 'eligibility_check_unavailable':
      return 'Genesis Pass eligibility check is temporarily unavailable. Please try again in a moment.';
    case 'genesis_pass_required':
      return 'Genesis Pass NFT is required to claim an alpha slot. Link your MetaMask on My Account and confirm the pass first.';
    case 'alpha_gate_disabled':
      return 'The public alpha is not open yet.';
    default: return null;
  }
}
