/**
 * usePadoAccount
 *
 * Unified selector that hides the BalanceManager / MarginAccount split and
 * exposes a single "Pado Account" abstraction. Consumers should prefer this
 * over reading BM and MA separately so the single-pocket UX stays coherent.
 */

import { useQuery } from '@tanstack/react-query';
import { useMarginAccount } from './useMarginAccount';
import { useBalanceManagerStore } from '../../trading/stores/balanceManagerStore';
import { getBalanceManagerBalances } from '../../../lib/deepbook';
import { POOLS } from '../../../config/network';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import { floatToRaw } from '../../../lib/unified-margin';

export interface PadoAccountState {
  /** True iff both BM and MA exist for the active wallet */
  isEnabled: boolean;
  /** True iff only one of BM/MA exists (legacy or anomalous) */
  isPartiallyEnabled: boolean;
  /** True iff BM exists */
  hasBalanceManager: boolean;
  /** True iff MA exists */
  hasMarginAccount: boolean;
  /** Combined NUSDC balance across BM (quote) + MA (nusdc), in 6-decimal raw units */
  totalNusdcRaw: bigint;
  /** Combined NBTC balance across BM (base, NBTC pool) + MA (nbtc), in 8-decimal raw units */
  totalNbtcRaw: bigint;
  /** Per-source breakdown for advanced surfaces / debugging */
  breakdown: {
    bm: { quoteRaw: bigint; baseRaw: bigint };
    ma: { nusdcRaw: bigint; nbtcRaw: bigint };
  };
  isLoading: boolean;
}

export function usePadoAccount(): PadoAccountState {
  const { account: marginAccount, accountId: marginAccountId, isLoading: isMaLoading } = useMarginAccount();
  const balanceManagerId = useBalanceManagerStore((s) => s.balanceManagerId);
  const adaptiveInterval = useAdaptiveInterval(10_000);

  const { data: bmBalance, isLoading: isBmLoading } = useQuery({
    queryKey: ['bm-balance-pado-account', balanceManagerId],
    queryFn: async () => {
      if (!balanceManagerId) return { base: 0, quote: 0 };
      return getBalanceManagerBalances(balanceManagerId, POOLS.NBTC_NUSDC);
    },
    refetchInterval: adaptiveInterval,
    staleTime: 5000,
    enabled: !!balanceManagerId,
  });

  const hasBalanceManager = !!balanceManagerId;
  const hasMarginAccount = !!marginAccountId;

  // BM helper returns formatted floats. Convert to raw units using toFixed-based
  // string parsing to avoid IEEE-754 round-trip errors (e.g. 0.1+0.2 precision loss).
  const bmQuoteRaw = floatToRaw(bmBalance?.quote ?? 0, 6);
  const bmBaseRaw = floatToRaw(bmBalance?.base ?? 0, 8);

  const maNusdcRaw = marginAccount?.nusdcBalance ?? 0n;
  const maNbtcRaw = marginAccount?.nbtcBalance ?? 0n;

  return {
    isEnabled: hasBalanceManager && hasMarginAccount,
    isPartiallyEnabled:
      (hasBalanceManager && !hasMarginAccount) ||
      (!hasBalanceManager && hasMarginAccount),
    hasBalanceManager,
    hasMarginAccount,
    totalNusdcRaw: bmQuoteRaw + maNusdcRaw,
    totalNbtcRaw: bmBaseRaw + maNbtcRaw,
    breakdown: {
      bm: { quoteRaw: bmQuoteRaw, baseRaw: bmBaseRaw },
      ma: { nusdcRaw: maNusdcRaw, nbtcRaw: maNbtcRaw },
    },
    isLoading: isMaLoading || isBmLoading,
  };
}
