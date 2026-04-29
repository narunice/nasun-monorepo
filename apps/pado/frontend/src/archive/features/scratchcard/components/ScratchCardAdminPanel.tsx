import { useState } from 'react';
import { useScratchCardAdmin } from '../hooks';
import { useScratchCardPool } from '../hooks';
import { formatNusdc } from '../types';
import { Spinner } from '../../../components/common';

export function ScratchCardAdminPanel() {
  const { isAdmin, isLoading, fundPool, withdrawPool, emergencyWithdrawAll, setPaused } =
    useScratchCardAdmin();
  const { pool } = useScratchCardPool();
  const [nusdcCoinId, setNusdcCoinId] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [actionResult, setActionResult] = useState<string | null>(null);

  if (isLoading) return <Spinner size="lg" />;

  if (!isAdmin) {
    return (
      <div className="text-sm text-theme-text-muted">
        No AdminCap found. Connect with the admin wallet.
      </div>
    );
  }

  const handleFund = async () => {
    if (!nusdcCoinId.trim()) return;
    const res = await fundPool(nusdcCoinId.trim());
    setActionResult(res.success ? `Funded! TX: ${res.digest}` : `Error: ${res.error}`);
    setNusdcCoinId('');
  };

  const handleWithdraw = async () => {
    const amount = BigInt(parseFloat(withdrawAmount) * 1_000_000);
    if (amount <= 0n) return;
    const res = await withdrawPool(amount);
    setActionResult(res.success ? `Withdrawn! TX: ${res.digest}` : `Error: ${res.error}`);
    setWithdrawAmount('');
  };

  const handleEmergency = async () => {
    if (!confirm('Emergency withdraw ALL funds and pause?')) return;
    const res = await emergencyWithdrawAll();
    setActionResult(res.success ? `Emergency done! TX: ${res.digest}` : `Error: ${res.error}`);
  };

  const handleTogglePause = async () => {
    const newState = !(pool?.isPaused ?? true);
    const res = await setPaused(newState);
    setActionResult(res.success ? `${newState ? 'Paused' : 'Unpaused'}` : `Error: ${res.error}`);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-theme-text-primary">
        Scratch Card Admin
      </h3>

      {pool && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-theme-text-muted">Pool Balance</div>
          <div className="text-theme-text-primary font-medium">
            {formatNusdc(pool.poolBalance)} NUSDC
          </div>
          <div className="text-theme-text-muted">Status</div>
          <div>{pool.isPaused ? 'Paused' : 'Active'}</div>
          <div className="text-theme-text-muted">Cards Sold</div>
          <div>{pool.totalCardsSold}</div>
          <div className="text-theme-text-muted">Prizes Paid</div>
          <div>{formatNusdc(pool.totalPrizesPaid)} NUSDC</div>
          <div className="text-theme-text-muted">Today</div>
          <div>{pool.dailyCardCount} cards</div>
        </div>
      )}

      <div className="space-y-3">
        {/* Fund Pool */}
        <div className="flex gap-2">
          <input
            className="flex-1 px-3 py-2 bg-theme-bg-tertiary rounded text-sm text-theme-text-primary placeholder-theme-text-muted"
            placeholder="NUSDC Coin Object ID"
            value={nusdcCoinId}
            onChange={(e) => setNusdcCoinId(e.target.value)}
          />
          <button onClick={handleFund} className="px-3 py-2 bg-green-600 text-white rounded text-sm">
            Fund
          </button>
        </div>

        {/* Withdraw */}
        <div className="flex gap-2">
          <input
            className="flex-1 px-3 py-2 bg-theme-bg-tertiary rounded text-sm text-theme-text-primary placeholder-theme-text-muted"
            placeholder="Amount (NUSDC)"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
          />
          <button onClick={handleWithdraw} className="px-3 py-2 bg-pd1 text-white rounded text-sm">
            Withdraw
          </button>
        </div>

        {/* Pause / Emergency */}
        <div className="flex gap-2">
          <button onClick={handleTogglePause} className="flex-1 px-3 py-2 bg-yellow-600 text-white rounded text-sm">
            {pool?.isPaused ? 'Unpause' : 'Pause'}
          </button>
          <button onClick={handleEmergency} className="flex-1 px-3 py-2 bg-red-600 text-white rounded text-sm">
            Emergency
          </button>
        </div>
      </div>

      {actionResult && (
        <p className="text-xs text-theme-text-muted break-all">{actionResult}</p>
      )}
    </div>
  );
}
