/**
 * Data fetching hook for connected wallet state.
 * Handles balances, NFTs, EVM state, network, and chain info.
 */

import { useEffect } from "react";
import {
  useNFTs,
  useMultiBalance,
  useBalance,
  useNetwork,
  useChain,
  useEVMBalance,
  useERC20Balances,
  getStoredEVMAddress,
  getAllTokens,
} from "@nasun/wallet";

const CUSTOM_SCROLLBAR_ID = "nasun-wallet-scrollbar";

function injectScrollbarStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(CUSTOM_SCROLLBAR_ID)) return;
  const style = document.createElement("style");
  style.id = CUSTOM_SCROLLBAR_ID;
  style.textContent = `
    .nasun-thin-scroll::-webkit-scrollbar { width: 4px; }
    .nasun-thin-scroll::-webkit-scrollbar-track { background: transparent; }
    .nasun-thin-scroll::-webkit-scrollbar-thumb {
      background: rgba(156,163,175,0.4);
      border-radius: 9999px;
    }
    .nasun-thin-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(156,163,175,0.6);
    }
    @media (prefers-color-scheme: dark) {
      .nasun-thin-scroll::-webkit-scrollbar-thumb {
        background: rgba(161,161,170,0.3);
      }
      .nasun-thin-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(161,161,170,0.5);
      }
    }
    .nasun-thin-scroll { scrollbar-width: thin; scrollbar-color: rgba(156,163,175,0.4) transparent; }
  `;
  document.head.appendChild(style);
}

export function useConnectedViewData() {
  // Inject custom scrollbar styles
  useEffect(() => {
    injectScrollbarStyles();
  }, []);

  // NFTs (all pages fetched automatically)
  const {
    data: accumulatedNfts,
    isLoading: nftsLoading,
  } = useNFTs({
    refetchInterval: 15000,
  });

  // Token balances
  const { data: balances, isLoading: balancesLoading } = useMultiBalance({
    pollingInterval: 15000,
  });

  // Network info
  const { networkType } = useNetwork();

  // Chain selection
  const { isEVM, isExternalMove, chain } = useChain();
  const storedEVMAddress = isEVM ? getStoredEVMAddress() : null;
  const evmAddressForHook: string | undefined = storedEVMAddress ?? undefined;
  const { balance: evmBalance, isLoading: evmBalanceLoading } = useEVMBalance(evmAddressForHook);

  // ERC-20 token balances (EVM only)
  const { balances: erc20Balances, isLoading: erc20Loading } = useERC20Balances(evmAddressForHook);

  // External Move native balance (Sui/IOTA)
  const { data: moveNativeBalance, isLoading: moveNativeLoading } = useBalance(undefined, {
    enabled: isExternalMove,
  });

  return {
    accumulatedNfts,
    nftsLoading,
    balances,
    balancesLoading,
    networkType,
    isEVM,
    isExternalMove,
    chain,
    storedEVMAddress,
    evmBalance,
    evmBalanceLoading,
    erc20Balances,
    erc20Loading,
    moveNativeBalance,
    moveNativeLoading,
    getAllTokens,
  };
}

export type ConnectedViewDataReturn = ReturnType<typeof useConnectedViewData>;
