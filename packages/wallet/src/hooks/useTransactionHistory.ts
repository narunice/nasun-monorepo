/**
 * useTransactionHistory Hook
 * Query transaction history for the connected wallet
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from './useWallet';
import { useZkLogin } from './useZkLogin';
import { getSuiClient } from '../sui/client';
import { getTokenByType } from '../config/tokens';
import type {
  TransactionHistoryItem,
  TransactionHistoryOptions,
  TransactionHistoryResult,
  TokenTransfer,
  TransactionDirection,
} from '../types';

// Query key prefix
const TX_HISTORY_QUERY_KEY = 'nasun-wallet-tx-history';

// Default limit
const DEFAULT_LIMIT = 20;

export interface UseTransactionHistoryOptions extends TransactionHistoryOptions {
  /** Disable automatic fetching */
  enabled?: boolean;
  /** Refetch interval in milliseconds */
  refetchInterval?: number;
}

export interface UseTransactionHistoryResult {
  /** List of transactions */
  data: TransactionHistoryItem[];
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Whether there are more transactions to load */
  hasNextPage: boolean;
  /** Cursor for next page */
  nextCursor?: string;
  /** Refetch function */
  refetch: () => void;
}

/**
 * Parse balance changes to extract token transfers
 */
function parseBalanceChanges(
  balanceChanges: Array<{
    owner: { AddressOwner?: string; ObjectOwner?: string };
    coinType: string;
    amount: string;
  }> | undefined,
  ownerAddress: string
): TokenTransfer[] {
  if (!balanceChanges || balanceChanges.length === 0) {
    return [];
  }

  const transfers: TokenTransfer[] = [];

  for (const change of balanceChanges) {
    // Only include changes for the wallet owner
    const changeOwner = change.owner.AddressOwner || change.owner.ObjectOwner;
    if (changeOwner !== ownerAddress) continue;

    const amount = BigInt(change.amount);
    if (amount === BigInt(0)) continue;

    const direction: TransactionDirection = amount > 0 ? 'in' : 'out';
    const absAmount = amount < 0 ? -amount : amount;

    // Get token info
    const tokenConfig = getTokenByType(change.coinType);
    const decimals = tokenConfig?.decimals ?? 9;
    const symbol = tokenConfig?.symbol;

    // Format amount
    const formatted = formatAmount(absAmount, decimals);

    transfers.push({
      tokenType: change.coinType,
      symbol,
      amount: formatted,
      rawAmount: absAmount.toString(),
      direction,
    });
  }

  return transfers;
}

/**
 * Format amount from minimum units to display units
 */
function formatAmount(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;

  if (fractionalPart === BigInt(0)) {
    return wholePart.toString();
  }

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  // Remove trailing zeros
  const trimmed = fractionalStr.replace(/0+$/, '');
  return `${wholePart}.${trimmed}`;
}

/**
 * Extract counterparty addresses from a transaction
 */
function extractCounterparties(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction: any,
  ownerAddress: string
): string[] {
  const counterparties: string[] = [];

  // Try to extract from balance changes
  const balanceChanges = transaction.balanceChanges;
  if (balanceChanges) {
    for (const change of balanceChanges) {
      const changeOwner = change.owner?.AddressOwner || change.owner?.ObjectOwner;
      if (changeOwner && changeOwner !== ownerAddress) {
        if (!counterparties.includes(changeOwner)) {
          counterparties.push(changeOwner);
        }
      }
    }
  }

  // If still no counterparties, try transaction input
  if (counterparties.length === 0 && transaction.transaction?.data?.sender) {
    const sender = transaction.transaction.data.sender;
    if (sender !== ownerAddress) {
      counterparties.push(sender);
    }
  }

  return counterparties.slice(0, 3); // Limit to 3 addresses
}

/**
 * Fetch transaction history for an address
 * Note: Nasun Devnet doesn't support FromOrToAddress filter,
 * so we query FromAddress and ToAddress separately and merge results.
 */
async function fetchTransactionHistory(
  address: string,
  options: TransactionHistoryOptions = {}
): Promise<TransactionHistoryResult> {
  const client = getSuiClient();
  const limit = options.limit || DEFAULT_LIMIT;
  // Request more per query since we're merging two queries
  const perQueryLimit = Math.ceil(limit / 2) + 5;

  try {
    // Query sent and received transactions in parallel
    // Use FromAddress for sent, and both ToAddress and Recipient for received
    const [sentResponse, receivedByToAddress, receivedByRecipient] = await Promise.all([
      client.queryTransactionBlocks({
        filter: { FromAddress: address },
        options: {
          showBalanceChanges: true,
          showEffects: true,
          showInput: true,
        },
        order: 'descending',
        limit: perQueryLimit,
      }),
      client.queryTransactionBlocks({
        filter: { ToAddress: address },
        options: {
          showBalanceChanges: true,
          showEffects: true,
          showInput: true,
        },
        order: 'descending',
        limit: perQueryLimit,
      }).catch(() => ({ data: [], hasNextPage: false })), // Fallback if not supported
      // Recipient filter catches TransferObjects recipients
      client.queryTransactionBlocks({
        filter: { Recipient: address } as Parameters<typeof client.queryTransactionBlocks>[0]['filter'],
        options: {
          showBalanceChanges: true,
          showEffects: true,
          showInput: true,
        },
        order: 'descending',
        limit: perQueryLimit,
      }).catch(() => ({ data: [], hasNextPage: false })), // Fallback if not supported
    ]);

    // Merge and deduplicate by digest from all three queries
    const seenDigests = new Set<string>();
    const allTxs = [];

    for (const tx of [...sentResponse.data, ...receivedByToAddress.data, ...receivedByRecipient.data]) {
      if (!seenDigests.has(tx.digest)) {
        seenDigests.add(tx.digest);
        allTxs.push(tx);
      }
    }

    // Sort by timestamp descending
    allTxs.sort((a, b) => {
      const timeA = a.timestampMs ? Number(a.timestampMs) : 0;
      const timeB = b.timestampMs ? Number(b.timestampMs) : 0;
      return timeB - timeA;
    });

    // Limit to requested amount
    const limitedTxs = allTxs.slice(0, limit);

    const items: TransactionHistoryItem[] = [];

    for (const tx of limitedTxs) {
      // Parse transaction
      const digest = tx.digest;
      const timestamp = tx.timestampMs ? Number(tx.timestampMs) : Date.now();
      const status = tx.effects?.status?.status === 'success' ? 'success' : 'failure';

      // Parse balance changes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transfers = parseBalanceChanges(tx.balanceChanges as any, address);

      // Determine primary direction based on gas payer
      const sender = tx.transaction?.data?.sender;
      const direction: TransactionDirection = sender === address ? 'out' : 'in';

      // Filter by direction if specified
      if (options.direction && options.direction !== direction) {
        continue;
      }

      // Extract counterparties
      const counterparties = extractCounterparties(tx, address);

      // Gas used
      const gasUsed = tx.effects?.gasUsed
        ? (
            BigInt(tx.effects.gasUsed.computationCost) +
            BigInt(tx.effects.gasUsed.storageCost) -
            BigInt(tx.effects.gasUsed.storageRebate)
          ).toString()
        : undefined;

      // Error message
      const error = tx.effects?.status?.error;

      items.push({
        digest,
        timestamp,
        status,
        direction,
        transfers,
        counterparties,
        gasUsed,
        error,
      });
    }

    // Check if there are more results (any query has more pages or we have more merged results)
    const hasMore = sentResponse.hasNextPage || receivedByToAddress.hasNextPage || receivedByRecipient.hasNextPage || allTxs.length > limit;

    return {
      data: items,
      hasNextPage: hasMore,
      nextCursor: undefined, // Pagination not supported with merged queries
    };
  } catch (error) {
    console.error('Failed to fetch transaction history:', error);
    return {
      data: [],
      hasNextPage: false,
    };
  }
}

/**
 * Hook to query transaction history for the connected wallet
 */
export function useTransactionHistory(
  options: UseTransactionHistoryOptions = {}
): UseTransactionHistoryResult {
  const { account, status } = useWallet();
  const { state: zkLoginState, isConnected: isZkConnected } = useZkLogin();
  const { enabled = true, refetchInterval, limit, cursor, direction } = options;

  // Use wallet address or zkLogin address
  const ownerAddress = account?.address || zkLoginState?.address;
  const isConnected = (status === 'unlocked' && account?.address) || isZkConnected;

  const query = useQuery({
    queryKey: [TX_HISTORY_QUERY_KEY, ownerAddress, limit, cursor, direction],
    queryFn: async () => {
      if (!ownerAddress) {
        throw new Error('Wallet not connected');
      }
      return fetchTransactionHistory(ownerAddress, { limit, cursor, direction });
    },
    enabled: enabled && !!isConnected && !!ownerAddress,
    refetchInterval,
    staleTime: 30000, // 30 seconds
  });

  return {
    data: query.data?.data || [],
    isLoading: query.isLoading,
    error: query.error ? String(query.error) : null,
    hasNextPage: query.data?.hasNextPage || false,
    nextCursor: query.data?.nextCursor,
    refetch: query.refetch,
  };
}

/**
 * Hook to refresh transaction history
 */
export function useRefreshTransactionHistory() {
  const { account } = useWallet();
  const { state: zkLoginState } = useZkLogin();
  const queryClient = useQueryClient();

  const ownerAddress = account?.address || zkLoginState?.address;

  return () => {
    if (ownerAddress) {
      queryClient.invalidateQueries({
        queryKey: [TX_HISTORY_QUERY_KEY, ownerAddress],
      });
    }
  };
}

/**
 * Hook to invalidate transaction history cache
 */
export function useInvalidateTransactionHistory() {
  const queryClient = useQueryClient();

  return (address?: string) => {
    if (address) {
      queryClient.invalidateQueries({
        queryKey: [TX_HISTORY_QUERY_KEY, address],
      });
    } else {
      queryClient.invalidateQueries({
        queryKey: [TX_HISTORY_QUERY_KEY],
      });
    }
  };
}
