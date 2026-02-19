/**
 * useTransferHistory Hook
 * Fetch user's token transfer history (send/receive) from on-chain data.
 */

import { useQuery } from '@tanstack/react-query';
import type { SuiTransactionBlockResponse } from '@mysten/sui/client';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { getSuiClient } from '../../../lib/sui-client';
import { TOKENS } from '../../../config/network';

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

const QUERY_LIMIT = 50;

// Build a coinType → {symbol, decimals} lookup from the pado TOKENS config
type CoinInfo = { symbol: string; decimals: number };
const COIN_TYPE_MAP: Record<string, CoinInfo> = {};
for (const token of Object.values(TOKENS)) {
  if (token.type) {
    COIN_TYPE_MAP[token.type] = { symbol: token.symbol, decimals: token.decimals };
  }
}

function getCoinInfo(coinType: string): CoinInfo {
  if (COIN_TYPE_MAP[coinType]) return COIN_TYPE_MAP[coinType];
  // Fallback: extract the last segment of the coin type (e.g. "0x...::nbtc::NBTC" -> "NBTC")
  const parts = coinType.split('::');
  return { symbol: parts[parts.length - 1] ?? coinType, decimals: 9 };
}

function safeBigInt(value: unknown): bigint {
  const str = String(value ?? '0');
  // BigInt handles negative strings like "-1234" correctly
  try {
    return BigInt(str);
  } catch {
    return BigInt(0);
  }
}

/**
 * Fetch transfer history for a given address.
 * Queries FromAddress, ToAddress, and Recipient in parallel since Nasun Devnet
 * does not support the FromOrToAddress compound filter.
 */
async function fetchTransferHistory(address: string): Promise<TransferRecord[]> {
  const client = getSuiClient();
  const queryOptions = {
    options: {
      showBalanceChanges: true,
      showEffects: true,
      showInput: true,
    },
    order: 'descending' as const,
    limit: QUERY_LIMIT,
  };

  const [fromResponse, toResponse, recipientResponse] = await Promise.all([
    client.queryTransactionBlocks({
      filter: { FromAddress: address },
      ...queryOptions,
    }),
    client.queryTransactionBlocks({
      filter: { ToAddress: address },
      ...queryOptions,
    }).catch((): { data: SuiTransactionBlockResponse[]; hasNextPage: false } => ({ data: [], hasNextPage: false })),
    // Recipient filter catches TransferObjects recipients; may not be supported on all nodes
    client.queryTransactionBlocks({
      filter: { Recipient: address } as unknown as Parameters<typeof client.queryTransactionBlocks>[0]['filter'],
      ...queryOptions,
    }).catch((): { data: SuiTransactionBlockResponse[]; hasNextPage: false } => ({ data: [], hasNextPage: false })),
  ]);

  // Deduplicate by digest
  const seen = new Set<string>();
  const allTxs: SuiTransactionBlockResponse[] = [];
  for (const tx of [...fromResponse.data, ...toResponse.data, ...recipientResponse.data]) {
    if (!seen.has(tx.digest)) {
      seen.add(tx.digest);
      allTxs.push(tx);
    }
  }

  // Sort by timestamp descending (null timestamps go to the end)
  allTxs.sort((a, b) => {
    const timeA = a.timestampMs ? Number(a.timestampMs) : 0;
    const timeB = b.timestampMs ? Number(b.timestampMs) : 0;
    return timeB - timeA;
  });

  const records: TransferRecord[] = [];

  for (const tx of allTxs) {
    // Skip failed transactions
    if (tx.effects?.status?.status !== 'success') continue;

    const balanceChanges = tx.balanceChanges as Array<{
      owner: { AddressOwner?: string; ObjectOwner?: string };
      coinType: string;
      amount: string;
    }> | undefined;

    if (!balanceChanges || balanceChanges.length === 0) continue;

    // Filter to only changes that affect the current address
    const myChanges = balanceChanges.filter((c) => {
      const owner = c.owner.AddressOwner || c.owner.ObjectOwner;
      return owner === address;
    });

    if (myChanges.length === 0) continue;

    const timestamp = tx.timestampMs ? Number(tx.timestampMs) : 0;
    const digest = tx.digest;
    const sender = tx.transaction?.data?.sender;

    // Determine whether this TX has non-NSN token changes (to identify gas-only NSN changes)
    const NSN_COIN_INFO = getCoinInfo(TOKENS.NASUN.type);
    const hasNonNsnChange = myChanges.some((c) => getCoinInfo(c.coinType).symbol !== NSN_COIN_INFO.symbol);

    let changeIndex = 0;
    for (const change of myChanges) {
      const amount = safeBigInt(change.amount);
      if (amount === BigInt(0)) continue;

      const coinInfo = getCoinInfo(change.coinType);
      const isNsn = coinInfo.symbol === NSN_COIN_INFO.symbol;

      // Filter gas-only NSN deductions: if there are other token changes in this TX,
      // and this is a negative NSN change, it is a gas fee — skip it.
      if (isNsn && amount < BigInt(0) && hasNonNsnChange) continue;

      const isSent = amount < BigInt(0);
      const absAmount = amount < BigInt(0) ? -amount : amount;
      const divisor = BigInt(10 ** coinInfo.decimals);
      const whole = absAmount / divisor;
      const frac = absAmount % divisor;
      const fracStr = frac.toString().padStart(coinInfo.decimals, '0').replace(/0+$/, '');
      const displayAmount = frac === BigInt(0)
        ? Number(whole)
        : Number(`${whole}.${fracStr}`);

      // Counterparty address
      let counterparty = '';
      if (isSent) {
        // Find the receiver: another address with a positive change for the same coinType
        const receiver = balanceChanges.find((c) => {
          const owner = c.owner.AddressOwner || c.owner.ObjectOwner;
          return owner && owner !== address && c.coinType === change.coinType && safeBigInt(c.amount) > BigInt(0);
        });
        counterparty = (receiver?.owner.AddressOwner || receiver?.owner.ObjectOwner) ?? '';
      } else {
        // Receiver is the current address; counterparty is the transaction sender
        counterparty = sender ?? '';
      }

      records.push({
        id: `${digest}_${change.coinType}_${changeIndex}`,
        type: isSent ? 'sent' : 'received',
        token: coinInfo.symbol,
        amount: displayAmount,
        address: counterparty,
        timestamp,
        txDigest: digest,
      });

      changeIndex++;
    }
  }

  return records;
}

export function useTransferHistory(): UseTransferHistoryResult {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const passkeyAddress = usePasskeyStore((s) => s.address);

  // Determine active address (zkLogin → regular wallet → passkey)
  const address = isZkConnected
    ? zkState?.address
    : status === 'unlocked'
      ? account?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;

  const isConnected = (status === 'unlocked' && !!account) || isZkConnected || isPasskeyUnlocked;

  const query = useQuery({
    queryKey: ['transferHistory', address],
    queryFn: () => fetchTransferHistory(address!),
    enabled: isConnected && !!address,
    staleTime: 30_000,
  });

  return {
    transfers: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? 'Failed to load transfer history' : null,
    refetch: query.refetch,
  };
}
