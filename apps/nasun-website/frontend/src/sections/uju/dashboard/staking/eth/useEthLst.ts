// Ethereum Liquid Staking Tokens (LSTs) read-only display.
// Plan v5 Phase 2C: stETH + wstETH (Lido).
//
// stETH is rebasing — balanceOf grows with each daily reward distribution.
// wstETH is the non-rebasing wrapper — balanceOf is fixed, but ratio (stEthPerToken)
// grows. Both must be shown together; many DeFi users hold wstETH not stETH.
//
// Display strategy: total stETH-equivalent (single number, prefixed with "≈" to
// signal rebasing variability). Component may opt to show breakdown on hover.
//
// Multicall3 batches the 2 balanceOf calls automatically. Ratio is fetched
// separately with 1h staleTime (Lido oracle ~daily, ratio drift per minute is
// negligible — saves ~50% multicall bandwidth vs co-batching with balances).

import { useReadContract, useReadContracts } from "wagmi";
import { mainnet } from "wagmi/chains";
import { erc20Abi, formatUnits, parseAbi } from "viem";

export const STETH_ADDRESS  = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" as const;
export const WSTETH_ADDRESS = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0" as const;
const WSTETH_ABI = parseAbi([
  "function stEthPerToken() view returns (uint256)",
]);

const E18 = 1_000_000_000_000_000_000n;

/**
 * wstETH balance × stEthPerToken / 1e18 = stETH equivalent.
 * stEthPerToken returns 1e18-scaled stETH per 1 wstETH (Lido convention).
 * e.g. ratio = 1180000000000000000n → 1 wstETH ≈ 1.18 stETH.
 */
export function wstethToSteth(wstethBal: bigint, ratio: bigint): bigint {
  return (wstethBal * ratio) / E18;
}

export interface EthLstView {
  stethBal: bigint;        // raw stETH balanceOf (rebasing)
  wstethBal: bigint;       // raw wstETH balanceOf (fixed)
  stethFromWsteth: bigint; // wstETH expressed in stETH
  totalSteth: bigint;      // stethBal + stethFromWsteth (single display value)
}

export interface UseEthLstResult {
  view: EthLstView | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useEthLst(user: `0x${string}` | undefined): UseEthLstResult {
  // Balances: 60s/120s (frequent updates fine on rebasing token)
  const balances = useReadContracts({
    allowFailure: false,
    contracts: user
      ? [
          {
            address: STETH_ADDRESS,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [user],
            chainId: mainnet.id,
          },
          {
            address: WSTETH_ADDRESS,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [user],
            chainId: mainnet.id,
          },
        ]
      : [],
    query: {
      enabled: !!user,
      staleTime: 300_000,
      refetchInterval: 300_000,
      refetchIntervalInBackground: false,
      retry: 2,
      retryDelay: (i: number) => Math.min(1000 * 2 ** i, 30_000),
    },
  });

  // Ratio: 1h staleTime (Lido oracle ~daily; per-minute drift negligible)
  const ratio = useReadContract({
    address: WSTETH_ADDRESS,
    abi: WSTETH_ABI,
    functionName: "stEthPerToken",
    chainId: mainnet.id,
    query: {
      staleTime: 3_600_000,
      refetchInterval: 3_600_000,
      retry: 2,
    },
  });

  let view: EthLstView | null = null;
  if (balances.data && ratio.data !== undefined) {
    const stethBal = (balances.data[0] ?? 0n) as bigint;
    const wstethBal = (balances.data[1] ?? 0n) as bigint;
    const r = ratio.data as bigint;
    const stethFromWsteth = r > 0n ? wstethToSteth(wstethBal, r) : 0n;
    view = {
      stethBal,
      wstethBal,
      stethFromWsteth,
      totalSteth: stethBal + stethFromWsteth,
    };
  }

  return {
    view,
    isLoading: balances.isLoading || ratio.isLoading,
    isError: balances.isError || ratio.isError,
    refetch: () => {
      balances.refetch();
      ratio.refetch();
    },
  };
}

/** Format a stETH-equivalent BigInt as "≈ X.XXXX stETH" with truncation. */
export function formatEthLstTotal(totalSteth: bigint): string {
  if (totalSteth === 0n) return "0 stETH";
  const s = formatUnits(totalSteth, 18);
  return `≈ ${truncateDecimals(s, 4)} stETH`;
}

function truncateDecimals(s: string, n: number): string {
  const [int, frac = ""] = s.split(".");
  if (!frac) return int;
  const trimmed = frac.slice(0, n).replace(/0+$/, "");
  return trimmed ? `${int}.${trimmed}` : int;
}
