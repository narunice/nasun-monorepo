/**
 * PR2.B — DeactivateAgentModal: stop the per-agent PM2 process and soft-
 * delete the SSM Parameter. The Parameter is hard-deleted by a server-side
 * cron only after a 7-day grace window — restore() can recover the agent
 * within that window.
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSigner } from '@nasun/wallet';
import { deactivateAgent } from '../../services/agentVaultClient';
import { useAgentActions } from '../../hooks/useAgentActions';

interface DeactivateAgentModalProps {
  agentAddress: string;
  agentName: string;
  walletAddress: string;
  /** Profile object id, needed for on-chain fallback when the agent is not vaulted. */
  agentProfileId: string;
  onDeactivated: () => void;
  onClose: () => void;
}

export function DeactivateAgentModal({
  agentAddress,
  agentName,
  walletAddress,
  agentProfileId,
  onDeactivated,
  onClose,
}: DeactivateAgentModalProps) {
  const { signer } = useSigner();
  const { deactivateAgent: deactivateOnChain } = useAgentActions();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => { onClose(); }, [onClose]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !busy) handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose, busy]);

  // Two-step deactivate:
  //   1. vault delete  → stops the PM2 process + soft-deletes the SSM Parameter
  //   2. on-chain flip → flips AgentProfile.is_active=false, the SSOT for
  //      every runtime gate AND the field useAgentProfiles reads back into
  //      the UI badge / button label. Without step 2 the badge stays "Active"
  //      after the 15s refetch and the toggle never flips, which is exactly
  //      the "did it actually pause?" confusion users reported.
  const finishWithSuccess = () => {
    setDone(true);
    onDeactivated();
    window.setTimeout(handleClose, 900);
  };

  const handleConfirm = async () => {
    setError(null);
    if (!signer) { setError('Wallet not connected.'); return; }
    setBusy(true);
    try {
      let vaultSkipped = false;
      try {
        await deactivateAgent(signer, walletAddress, agentAddress);
      } catch (err) {
        const code = (err as { code?: string }).code;
        // Agent was never vaulted (legacy / pre-vault). Nothing to stop on the
        // server; on-chain flip alone satisfies the user's intent.
        if (code === 'not_active') {
          vaultSkipped = true;
        } else {
          setError(mapErrorCode(code) ?? (err instanceof Error ? err.message : 'unknown'));
          return;
        }
      }

      const ok = await deactivateOnChain(agentProfileId);
      if (!ok) {
        setError(
          vaultSkipped
            ? 'On-chain deactivation failed. See wallet popup for details.'
            : 'Runtime stopped, but on-chain status flip failed. Retry to finish; the agent is already not running.',
        );
        return;
      }

      finishWithSuccess();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) handleClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="deactivate-agent-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-uju-card border border-uju-border/60 shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-uju-border/60">
          <h2 id="deactivate-agent-title" className="text-base font-semibold text-white">
            Deactivate {agentName}
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
            <p className="font-medium">The agent will stop running on the server.</p>
            <p className="mt-1 text-amber-200/80">
              You can restore it within 7 days. After that the encrypted key is permanently deleted
              and you would need to upload it again from your browser-stored copy.
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
              {error}
            </div>
          )}

          {done && !error && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-sm text-emerald-300" role="status">
              Agent paused. Runtime stopped and on-chain status updated.
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl border border-uju-border/60 text-sm text-uju-secondary hover:bg-uju-bg/60 transition-colors disabled:opacity-40"
            >
              {done ? 'Close' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={busy || done}
              className="flex-1 py-2.5 rounded-xl bg-red-500/80 text-white text-sm font-medium hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {done ? 'Paused' : busy ? 'Deactivating...' : 'Confirm deactivate'}
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
    case 'not_active': return null;
    case 'rate_limited': return 'Too many requests. Wait a minute and retry.';
    default: return null;
  }
}
