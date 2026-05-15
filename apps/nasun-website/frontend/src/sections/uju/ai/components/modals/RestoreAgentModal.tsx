/**
 * PR2.B — RestoreAgentModal: bring an agent back during the 7-day grace
 * window after Deactivate. Server reuses the SSM Parameter and re-spawns
 * the PM2 process. The wake_port may be different (it could have been
 * reassigned to another agent during the grace window) — surfaced in the
 * confirmation copy.
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSigner } from '@nasun/wallet';
import { restoreAgent } from '../../services/agentVaultClient';

interface RestoreAgentModalProps {
  agentAddress: string;
  agentName: string;
  walletAddress: string;
  graceEndsAt: number | null;
  onRestored: () => void;
  onClose: () => void;
}

export function RestoreAgentModal({
  agentAddress,
  agentName,
  walletAddress,
  graceEndsAt,
  onRestored,
  onClose,
}: RestoreAgentModalProps) {
  const { signer } = useSigner();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => { onClose(); }, [onClose]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !busy) handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose, busy]);

  const handleConfirm = async () => {
    setError(null);
    if (!signer) { setError('Wallet not connected.'); return; }
    setBusy(true);
    try {
      await restoreAgent(signer, walletAddress, agentAddress);
      onRestored();
      handleClose();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(mapErrorCode(code) ?? (err instanceof Error ? err.message : 'unknown'));
    } finally {
      setBusy(false);
    }
  };

  const graceText = graceEndsAt
    ? `Recovery window ends ${new Date(graceEndsAt).toLocaleString('en-US')}.`
    : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) handleClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-agent-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-uju-card border border-uju-border/60 shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-uju-border/60">
          <h2 id="restore-agent-title" className="text-base font-semibold text-white">
            Restore {agentName}
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
          <div className="rounded-xl bg-pado-1/10 border border-pado-1/30 px-3 py-2.5 text-sm text-pado-2">
            <p className="font-medium">The agent will resume running on the server.</p>
            {graceText && <p className="mt-1 text-pado-2/80">{graceText}</p>}
            <p className="mt-1 text-pado-2/80">
              The wake port may differ from before. The runtime will start a new cycle within
              ~5 minutes.
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl border border-uju-border/60 text-sm text-uju-secondary hover:bg-uju-bg/60 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-pado-2 text-uju-bg text-sm font-medium hover:bg-pado-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? 'Restoring...' : 'Confirm restore'}
            </button>
          </div>
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
    case 'not_vaulted': return 'No vault record found for this agent.';
    case 'still_active': return 'Agent is already active.';
    case 'grace_window_expired': return 'Recovery window has ended. Re-upload the key from your browser to reactivate.';
    case 'already_purged': return 'Server vault already purged the key. Re-upload from your browser.';
    case 'no_free_port': return 'Server has no free port. Wait for another agent to deactivate.';
    case 'spawn_failed': return 'Server failed to start the agent process.';
    case 'rate_limited': return 'Too many requests. Wait a minute and retry.';
    default: return null;
  }
}
