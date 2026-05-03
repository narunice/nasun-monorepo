/**
 * WithdrawAllConfirmModal
 *
 * Confirmation step before draining all funds (BM + MA combined) to wallet.
 * Prevents accidental one-click full-fund drain.
 */

interface WithdrawAllConfirmModalProps {
  bmNusdcRaw: bigint;
  bmNbtcRaw: bigint;
  maNusdcRaw: bigint;
  isLoading: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function formatNusdc(amount: bigint): string {
  const value = Number(amount) / 1e6;
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNbtc(amount: bigint): string {
  const value = Number(amount) / 1e8;
  return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 });
}

export function WithdrawAllConfirmModal({
  bmNusdcRaw,
  bmNbtcRaw,
  maNusdcRaw,
  isLoading,
  error,
  onConfirm,
  onCancel,
}: WithdrawAllConfirmModalProps) {
  const totalNusdcRaw = bmNusdcRaw + maNusdcRaw;
  const hasBmNusdc = bmNusdcRaw > 0n;
  const hasBmNbtc = bmNbtcRaw > 0n;
  const hasMaNusdc = maNusdcRaw > 0n;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-theme-text-primary mb-3">Withdraw All from Pado</h3>

        <p className="text-sm text-theme-text-secondary mb-4">
          This will withdraw all funds from your Pado Balance to your wallet.
        </p>

        {/* Amount breakdown */}
        <div className="bg-theme-bg-primary rounded-lg p-3 mb-4 space-y-2 text-sm">
          {hasBmNusdc && (
            <div className="flex justify-between">
              <span className="text-theme-text-muted">Trading (BM):</span>
              <span className="font-mono text-theme-text-primary">{formatNusdc(bmNusdcRaw)} NUSDC</span>
            </div>
          )}
          {hasBmNbtc && (
            <div className="flex justify-between">
              <span className="text-theme-text-muted">Trading (BM):</span>
              <span className="font-mono text-theme-text-primary">{formatNbtc(bmNbtcRaw)} NBTC</span>
            </div>
          )}
          {hasMaNusdc && (
            <div className="flex justify-between">
              <span className="text-theme-text-muted">Margin Account:</span>
              <span className="font-mono text-theme-text-primary">{formatNusdc(maNusdcRaw)} NUSDC</span>
            </div>
          )}
          {totalNusdcRaw > 0n && (
            <>
              <div className="border-t border-theme-border" />
              <div className="flex justify-between font-semibold">
                <span className="text-theme-text-secondary">Total NUSDC:</span>
                <span className="font-mono text-theme-text-primary">{formatNusdc(totalNusdcRaw)} NUSDC</span>
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-500 mb-4">{error}</div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-2 bg-theme-bg-tertiary text-theme-text-primary rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Withdrawing...
              </>
            ) : (
              'Confirm Withdraw All'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
