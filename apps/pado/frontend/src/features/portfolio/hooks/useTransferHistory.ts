/**
 * useTransferHistory Hook
 * Fetch user's token transfer history (send/receive)
 */

import { useState, useEffect, useCallback } from 'react';
import { useWallet, useZkLogin } from '@nasun/wallet';

export interface TransferRecord {
  id: string;
  type: 'sent' | 'received';
  token: string;
  amount: number;
  address: string; // To address for sent, From address for received
  timestamp: number;
  txDigest: string;
}

interface UseTransferHistoryResult {
  transfers: TransferRecord[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTransferHistory(): UseTransferHistoryResult {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine active address (zkLogin takes priority)
  const address = isZkConnected
    ? zkState?.address
    : status === 'unlocked'
      ? account?.address
      : undefined;
  const isConnected = (status === 'unlocked' && account) || isZkConnected;

  // Clear transfers immediately when address changes (prevents stale data)
  useEffect(() => {
    console.log('[useTransferHistory] Address changed, clearing transfers:', address);
    setTransfers([]);
    setError(null);
  }, [address]);

  const fetchTransfers = useCallback(async () => {
    console.log('[useTransferHistory] fetchTransfers called with address:', address);

    if (!isConnected || !address) {
      setTransfers([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // TODO: Replace with actual blockchain query
      // For now, generate simulated transfer history
      const simulatedTransfers = generateSimulatedTransfers(address);

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      setTransfers(simulatedTransfers);
    } catch (err) {
      console.error('Failed to fetch transfer history:', err);
      setError('Failed to load transfer history');
      setTransfers([]);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, address]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  return {
    transfers,
    isLoading,
    error,
    refetch: fetchTransfers,
  };
}

// Generate simulated transfers for demo purposes
function generateSimulatedTransfers(accountAddress: string): TransferRecord[] {
  const seed = accountAddress.slice(2, 10);
  const seedNum = parseInt(seed, 16) || 12345;

  const tokens = ['NASUN', 'NBTC', 'NUSDC'];
  const transfers: TransferRecord[] = [];
  const now = Date.now();
  const transferCount = 15 + (seedNum % 15); // 15-29 transfers

  for (let i = 0; i < transferCount; i++) {
    const token = tokens[i % 3];
    const isSent = (seedNum + i) % 2 === 0;

    // Generate random address
    const randomAddr = `0x${((seedNum * (i + 1)) % 0xFFFFFFFF).toString(16).padStart(8, '0')}...${((seedNum * (i + 2)) % 0xFFFF).toString(16).padStart(4, '0')}`;

    // Amount based on token
    let amount: number;
    if (token === 'NBTC') {
      amount = 0.0001 + ((seedNum * (i + 1)) % 100) / 100000;
    } else if (token === 'NUSDC') {
      amount = 10 + ((seedNum * (i + 1)) % 1000);
    } else {
      amount = 1 + ((seedNum * (i + 1)) % 100);
    }

    transfers.push({
      id: `transfer-${i}-${seed}`,
      type: isSent ? 'sent' : 'received',
      token,
      amount,
      address: randomAddr,
      timestamp: now - (i * 7200000) - ((seedNum * i) % 7200000), // Past hours (spread more)
      txDigest: `0x${seed}${i.toString(16).padStart(8, '0')}`,
    });
  }

  return transfers.sort((a, b) => b.timestamp - a.timestamp);
}
