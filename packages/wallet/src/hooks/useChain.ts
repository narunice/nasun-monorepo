/**
 * useChain Hook
 *
 * Manages multi-chain selection across Move (Nasun) and EVM chains.
 * Persists selection to localStorage for user preference.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChainConfig } from '../config/chains';
import {
  CHAINS,
  DEFAULT_CHAIN_ID,
  getChain,
  getAllChains,
  getEVMChains,
  getMoveChains,
  getNasunChains,
  getExternalMoveChains,
} from '../config/chains';

/**
 * Chain store state
 */
interface ChainState {
  /** Current chain ID */
  currentChainId: string;
  /** Set the current chain */
  setChain: (chainId: string) => void;
  /** Reset to default chain (Nasun Devnet) */
  resetToDefault: () => void;
}

/**
 * Zustand store for chain state with persistence
 */
export const useChainStore = create<ChainState>()(
  persist(
    (set) => ({
      currentChainId: DEFAULT_CHAIN_ID,
      setChain: (chainId: string) => {
        // Validate chain exists
        if (!getChain(chainId)) {
          console.warn(`[useChain] Unknown chain: ${chainId}`);
          return;
        }
        set({ currentChainId: chainId });
      },
      resetToDefault: () => {
        set({ currentChainId: DEFAULT_CHAIN_ID });
      },
    }),
    {
      name: 'nasun-wallet-chain',
    }
  )
);

/**
 * Result of useChain hook
 */
export interface UseChainResult {
  /** Current chain configuration */
  chain: ChainConfig;
  /** Current chain ID */
  chainId: string;
  /** Whether current chain is an EVM chain */
  isEVM: boolean;
  /** Whether current chain is a Move chain (Nasun/Sui) */
  isMove: boolean;
  /** Whether current chain is a testnet */
  isTestnet: boolean;
  /** Whether current chain supports Account Abstraction */
  supportsAA: boolean;
  /** All available chains */
  chains: ChainConfig[];
  /** EVM chains only */
  evmChains: ChainConfig[];
  /** Move chains only */
  moveChains: ChainConfig[];
  /** Nasun Move chains (always visible) */
  nasunChains: ChainConfig[];
  /** External Move chains like Sui/IOTA (Pro Mode only) */
  externalMoveChains: ChainConfig[];
  /** Switch to a different chain */
  switchChain: (chainId: string) => void;
  /** Switch to an EVM chain by its numeric chain ID */
  switchChainByEvmId: (evmChainId: number) => void;
}

/**
 * Hook for managing multi-chain selection
 *
 * @example
 * ```tsx
 * const { chain, isEVM, switchChain } = useChain();
 *
 * return (
 *   <select value={chain.id} onChange={(e) => switchChain(e.target.value)}>
 *     {chains.map((c) => (
 *       <option key={c.id} value={c.id}>{c.name}</option>
 *     ))}
 *   </select>
 * );
 * ```
 */
export function useChain(): UseChainResult {
  const { currentChainId, setChain } = useChainStore();

  // Get current chain config, fallback to default if not found
  const chain = getChain(currentChainId) || CHAINS[DEFAULT_CHAIN_ID];

  const switchChainByEvmId = (evmChainId: number) => {
    const targetChain = getAllChains().find((c) => c.chainId === evmChainId);
    if (targetChain) {
      setChain(targetChain.id);
    } else {
      console.warn(`[useChain] Unknown EVM chain ID: ${evmChainId}`);
    }
  };

  return {
    chain,
    chainId: currentChainId,
    isEVM: chain.type === 'evm',
    isMove: chain.type === 'move',
    isTestnet: chain.testnet ?? false,
    supportsAA: !!chain.aa,
    chains: getAllChains(),
    evmChains: getEVMChains(),
    moveChains: getMoveChains(),
    nasunChains: getNasunChains(),
    externalMoveChains: getExternalMoveChains(),
    switchChain: setChain,
    switchChainByEvmId,
  };
}

/**
 * Selector hook to get just the current chain ID
 */
export function useCurrentChainId(): string {
  return useChainStore((state) => state.currentChainId);
}

/**
 * Selector hook to check if current chain is EVM
 */
export function useIsEVMChain(): boolean {
  const chainId = useCurrentChainId();
  const chain = getChain(chainId);
  return chain?.type === 'evm';
}

/**
 * Selector hook to check if current chain is Move
 */
export function useIsMoveChain(): boolean {
  const chainId = useCurrentChainId();
  const chain = getChain(chainId);
  return chain?.type === 'move';
}
