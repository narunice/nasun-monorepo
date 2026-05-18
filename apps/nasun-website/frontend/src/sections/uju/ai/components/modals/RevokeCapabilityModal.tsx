/**
 * RevokeCapabilityModal: typed-confirmation gate for capability::revoke.
 *
 * Revoking is irreversible on-chain; once landed the runtime aborts every
 * subsequent /execute-capability call with E_CAPABILITY_REVOKED, the
 * agent cannot land any further AERs, and the only path forward is to
 * register a new agent with a fresh capability. The DangerZoneCard
 * surface sits right under Server status after the Track E reordering,
 * so an inline 2-click toggle has too much accidental-click surface
 * area for that move. This modal makes the user explicitly type the
 * word REVOKE before submission.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { truncateAddress } from '../../utils/format';

const REQUIRED_PHRASE = 'REVOKE';

interface RevokeCapabilityModalProps {
  capabilityId: string;
  /** Live tx state from useCapability so the modal disables Submit during signing. */
  txBusy: boolean;
  /** Most recent error from useCapability; null when no error or after reset. */
  txError: string | null;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function RevokeCapabilityModal({
  capabilityId,
  txBusy,
  txError,
  onConfirm,
  onClose,
}: RevokeCapabilityModalProps) {
  const [typed, setTyped] = useState('');
  const canConfirm = typed === REQUIRED_PHRASE && !txBusy;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !txBusy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, txBusy]);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    await onConfirm();
    // The parent (DangerZoneCard / useCapability) refetches and re-renders
    // with cap.revoked === true on success; it is responsible for closing
    // this modal via its own state. We do not close here so the user sees
    // any tx error surfaced in txError before dismissing.
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="revoke-cap-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !txBusy) onClose();
      }}
    >
      <div className="w-full max-w-md bg-uju-card rounded-xl border border-red-500/40 shadow-2xl p-5 space-y-4">
        <div className="space-y-1">
          <h2 id="revoke-cap-title" className="text-sm font-semibold text-red-300">
            Revoke capability
          </h2>
          <p className="text-sm text-uju-secondary">
            Capability <span className="font-mono text-white">{truncateAddress(capabilityId)}</span>{' '}
            will be permanently revoked on chain.
          </p>
        </div>

        <div className="px-3 py-2 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 space-y-1.5">
          <p className="font-medium">This cannot be undone.</p>
          <p>The next runtime cycle aborts with E_CAPABILITY_REVOKED. The agent can no longer land AERs or execute trades. The encrypted key in the server vault is unaffected, but to resume trading you must register a new agent with a fresh capability.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-uju-secondary">
            Type <span className="font-mono text-white">{REQUIRED_PHRASE}</span> to confirm
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            disabled={txBusy}
            placeholder={REQUIRED_PHRASE}
            className="w-full px-3 py-2 text-sm rounded-lg bg-uju-bg border border-uju-border/60 text-white placeholder:text-uju-secondary/60 focus:outline-none focus:border-red-400 transition-colors"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {txError && (
          <div className="px-3 py-2 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 break-words">
            {txError}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={txBusy}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg/60 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 font-medium hover:bg-red-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {txBusy ? 'Revoking...' : 'Revoke permanently'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
