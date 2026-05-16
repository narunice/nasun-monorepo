import { useReadContract, useAccount } from "wagmi";
import { formatEther } from "viem";
import {
  GENESIS_PASS_ABI,
  GENESIS_PASS_CHAIN_ID,
  GENESIS_PASS_CONTRACT,
} from "@/constants/genesis-pass-contract";

export function useNftDropRead() {
  const { address } = useAccount();
  const contractAddress = GENESIS_PASS_CONTRACT;

  const { data: currentStage } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "currentStage",
    chainId: GENESIS_PASS_CHAIN_ID,
    query: { refetchInterval: 60_000, refetchOnWindowFocus: false },
  });

  const { data: currentMintPrice } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "currentMintPrice",
    chainId: GENESIS_PASS_CHAIN_ID,
    query: { refetchInterval: 60_000 },
  });

  const { data: mintDeadline } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "mintDeadline",
    chainId: GENESIS_PASS_CHAIN_ID,
    query: { staleTime: 300_000 },
  });

  const { data: transfersUnlocked } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "transfersUnlocked",
    chainId: GENESIS_PASS_CHAIN_ID,
    query: { staleTime: 300_000 },
  });

  const stageNum = currentStage != null ? Number(currentStage) : 0;

  const { data: mintedCount } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "mintedPerStage",
    args: [stageNum, address!],
    chainId: GENESIS_PASS_CHAIN_ID,
    query: { enabled: !!address && stageNum > 0 },
  });

  const { data: walletLimit } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "walletLimitPerStage",
    args: [stageNum],
    chainId: GENESIS_PASS_CHAIN_ID,
    query: { enabled: stageNum > 0 },
  });

  const hasReachedLimit =
    mintedCount != null && walletLimit != null
    && (walletLimit as bigint) > 0n
    && (mintedCount as bigint) >= (walletLimit as bigint);

  return {
    contractAddress,
    currentStage: stageNum,
    mintPrice: currentMintPrice != null ? formatEther(currentMintPrice as bigint) : "0",
    mintPriceWei: currentMintPrice as bigint | undefined,
    mintDeadline: mintDeadline != null ? Number(mintDeadline) : 0,
    transfersUnlocked: transfersUnlocked === true,
    isDeployed: !!contractAddress,
    hasReachedLimit,
  };
}
