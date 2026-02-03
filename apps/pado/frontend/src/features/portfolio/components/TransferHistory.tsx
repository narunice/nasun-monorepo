/**
 * TransferHistory Component
 * Display user's token transfer history (send/receive) with Load More pagination
 */

import { useState } from 'react';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { useTransferHistory, type TransferRecord } from '../hooks/useTransferHistory';

const ITEMS_PER_PAGE = 10;

interface TransferRowProps {
  transfer: TransferRecord;
}

function TransferRow({ transfer }: TransferRowProps) {
  const isSent = transfer.type === 'sent';
  const typeColor = isSent
    ? 'text-red-600 dark:text-red-400'
    : 'text-green-600 dark:text-green-400';
  const typeBg = isSent
    ? 'bg-red-100 dark:bg-red-900/30'
    : 'bg-green-100 dark:bg-green-900/30';

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (token: string, amount: number) => {
    if (token === 'NBTC') {
      return amount.toFixed(6);
    } else if (token === 'NUSDC') {
      return amount.toFixed(2);
    }
    return amount.toFixed(2);
  };

  return (
    <tr className="hover:bg-theme-bg-tertiary/30 transition-colors">
      <td className="py-2.5 px-3">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeBg} ${typeColor}`}>
          {isSent ? 'SENT' : 'RECEIVED'}
        </span>
      </td>
      <td className="py-2.5 px-3 font-medium text-sm">
        {transfer.token}
      </td>
      <td className={`py-2.5 px-3 text-right font-mono text-sm ${typeColor}`}>
        {isSent ? '-' : '+'}{formatAmount(transfer.token, transfer.amount)}
      </td>
      <td className="py-2.5 px-3 text-sm font-mono text-theme-text-secondary">
        <span title={transfer.address}>
          {isSent ? 'To: ' : 'From: '}{transfer.address}
        </span>
      </td>
      <td className="py-2.5 px-3 text-right text-xs text-theme-text-muted">
        {formatTime(transfer.timestamp)}
      </td>
    </tr>
  );
}

export function TransferHistory() {
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { transfers, isLoading, error, refetch } = useTransferHistory();
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);

  const isConnected = status === 'unlocked' || isZkConnected;
  const displayedTransfers = transfers.slice(0, displayCount);
  const hasMore = displayCount < transfers.length;
  const remaining = transfers.length - displayCount;

  const handleLoadMore = () => {
    setDisplayCount((prev) => Math.min(prev + ITEMS_PER_PAGE, transfers.length));
  };

  if (!isConnected) {
    return (
      <div className="p-8 text-center text-theme-text-muted">
        Connect wallet to view your transfer history
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-theme-text-muted">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="text-red-600 dark:text-red-400 mb-2">{error}</div>
        <button
          onClick={refetch}
          className="text-xs text-pd1 dark:text-pd3 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="p-8 text-center text-theme-text-muted">
        No transfers yet. Send or receive tokens to see your history here.
      </div>
    );
  }

  return (
    <>
      <div className="px-4 py-2 text-xs text-theme-text-muted text-right">
        {displayedTransfers.length} of {transfers.length} transfers
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-theme-text-secondary bg-theme-bg-tertiary/50">
            <tr>
              <th className="py-2 px-3 text-left font-medium">Type</th>
              <th className="py-2 px-3 text-left font-medium">Token</th>
              <th className="py-2 px-3 text-right font-medium">Amount</th>
              <th className="py-2 px-3 text-left font-medium">Address</th>
              <th className="py-2 px-3 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme-border">
            {displayedTransfers.map((transfer) => (
              <TransferRow key={transfer.id} transfer={transfer} />
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="p-4 border-t border-theme-border">
          <button
            onClick={handleLoadMore}
            className="w-full py-2 px-4 text-sm font-medium text-pd1 dark:text-pd3
                       bg-pd5 dark:bg-pd0/20 hover:bg-pd5 dark:hover:bg-pd0/30
                       rounded-lg transition-colors"
          >
            Load More ({remaining} more)
          </button>
        </div>
      )}
    </>
  );
}
