/**
 * TosAcknowledgementModal: alpha consent gate shown immediately before
 * the first agent server activation. Three explicit checkboxes the user
 * must individually tick, then a single confirm action persists the
 * acceptance to localStorage so subsequent activations skip the gate.
 *
 * Why localStorage and not on-chain: this is a UX disclosure for an
 * alpha prototype, not an enforceable legal artifact. Sophisticated
 * users can clear localStorage; that is fine. The point is to make the
 * three commitments visible before the first activation, not to bind.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export const TOS_LOCALSTORAGE_KEY = 'nasun-ai-tos-accepted-v1';

export function hasAcceptedTos(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(TOS_LOCALSTORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markTosAccepted(): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TOS_LOCALSTORAGE_KEY, '1');
    }
  } catch {
    // localStorage unavailable (private mode, quota); silently ignore so
    // the user can still activate. The gate will simply re-appear next
    // time which is the safe failure mode.
  }
}

interface TosAcknowledgementModalProps {
  onAccept: () => void;
  onCancel: () => void;
}

const ACK_ITEMS = [
  {
    id: 'prototype',
    text:
      'I understand this is a prototype and there is a real risk of losing the funds I send to the agent.',
  },
  {
    id: 'unaudited',
    text:
      'I understand the smart contracts and runtime code have not undergone an external security audit.',
  },
  {
    id: 'no-tee',
    text:
      'I understand TEE / Nitro Enclave attestation is on the long-term roadmap and is not part of this alpha.',
  },
] as const;

type AckId = (typeof ACK_ITEMS)[number]['id'];

export function TosAcknowledgementModal({ onAccept, onCancel }: TosAcknowledgementModalProps) {
  const [acks, setAcks] = useState<Record<AckId, boolean>>({
    prototype: false,
    unaudited: false,
    'no-tee': false,
  });

  const allChecked = ACK_ITEMS.every((item) => acks[item.id]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const handleConfirm = () => {
    if (!allChecked) return;
    markTosAccepted();
    onAccept();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tos-ack-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md bg-uju-card rounded-xl border border-uju-border/60 shadow-2xl p-5 space-y-4">
        <div className="space-y-1">
          <h2 id="tos-ack-title" className="text-sm font-semibold text-white">Before activating this agent</h2>
          <p className="text-sm text-uju-secondary">
            Nasun AI is an alpha prototype. Read each statement and tick the boxes if you agree.
          </p>
        </div>

        <ul className="space-y-3">
          {ACK_ITEMS.map((item) => (
            <li key={item.id}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acks[item.id]}
                  onChange={(e) =>
                    setAcks((prev) => ({ ...prev, [item.id]: e.target.checked }))
                  }
                  className="mt-0.5 w-4 h-4 accent-pado-2"
                />
                <span className="text-sm text-white leading-snug">{item.text}</span>
              </label>
            </li>
          ))}
        </ul>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg/60 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!allChecked}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-pado-2 text-black font-medium hover:bg-pado-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm and continue
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
