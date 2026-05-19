import { createPortal } from 'react-dom';
import { formatSoeAsNasun } from '../../../lib/format';
import { getExplorerTxUrl } from '../../../lib/explorer';

export interface BurnResultDetails {
  /** Number of tickets the user intended to burn. */
  total: number;
  /** Number that succeeded (chunks that confirmed). */
  burned: number;
  /** Aggregate storage rebate in SOE across successful chunks. */
  storageRebateSoe: bigint;
  /** Tx digests of successful chunks. */
  digests: string[];
  /** Optional round number, when the bulk burn was scoped to one round. */
  roundNumber?: number;
}

interface BurnResultModalProps {
  result: BurnResultDetails | null;
  onClose: () => void;
}

export function BurnResultModal({ result, onClose }: BurnResultModalProps) {
  if (!result) return null;

  const { total, burned, storageRebateSoe, digests, roundNumber } = result;
  const failed = total - burned;
  const allFailed = burned === 0 && failed > 0;
  const partial = burned > 0 && failed > 0;

  const headline = allFailed
    ? 'Burn failed'
    : partial
      ? 'Partially burned'
      : 'Tickets burned';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel max-w-md w-full p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="burn-result-modal-title"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="burn-result-modal-title" className="font-display text-2xl text-gold">
            {headline}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-300 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-300">Tickets burned</span>
            <span className="font-mono text-neutral-100">
              {burned} <span className="text-neutral-400">/ {total}</span>
              {roundNumber !== undefined && (
                <span className="text-neutral-400"> · round #{roundNumber}</span>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-300">Storage rebate</span>
            <span className="font-mono text-gold-200">
              {formatSoeAsNasun(storageRebateSoe)} NASUN
            </span>
          </div>

          {failed > 0 && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-rose-200">
              {failed} ticket{failed === 1 ? '' : 's'} could not be burned.
              {' '}
              {allFailed
                ? 'Devnet may be lagging — try again in a moment.'
                : 'The remaining tickets are still in your wallet; try again to clean them up.'}
            </div>
          )}

          <p className="text-xs text-neutral-400 leading-relaxed">
            The storage rebate refunds the NASUN that was locked on-chain when the
            ticket NFTs were minted. It is credited to your wallet as gas-spendable
            balance.
          </p>

          {digests.length > 0 && (
            <details className="rounded-lg border border-gold-subtle p-3">
              <summary className="cursor-pointer text-xs text-neutral-300">
                Transactions ({digests.length})
              </summary>
              <ul className="mt-2 space-y-1 text-xs">
                {digests.map((d) => (
                  <li key={d} className="truncate">
                    <a
                      href={getExplorerTxUrl(d)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold-200 hover:underline font-mono"
                    >
                      {d.slice(0, 10)}…{d.slice(-6)}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="btn-gold !py-2 !px-5 text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
