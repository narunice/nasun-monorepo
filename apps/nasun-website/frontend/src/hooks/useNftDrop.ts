import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId, useSwitchChain } from "wagmi";
import { parseEther, formatEther } from "viem";
import { useState, useCallback } from "react";
import { GENESIS_PASS_ABI, GENESIS_PASS_ADDRESSES } from "@/constants/genesis-pass-contract";

function getContractAddress(chainId: number): `0x${string}` | undefined {
  const addr = GENESIS_PASS_ADDRESSES[chainId];
  return addr ? (addr as `0x${string}`) : undefined;
}

export function useNftDropRead() {
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId);

  const { data: currentStage } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "currentStage",
    query: { refetchInterval: 10_000 },
  });

  const { data: mintPrice } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "mintPrice",
  });

  const { data: mintDeadline } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "mintDeadline",
  });

  return {
    contractAddress,
    currentStage: currentStage != null ? Number(currentStage) : 0,
    mintPrice: mintPrice != null ? formatEther(mintPrice as bigint) : "0",
    mintPriceWei: mintPrice as bigint | undefined,
    mintDeadline: mintDeadline != null ? Number(mintDeadline) : 0,
    isDeployed: !!contractAddress,
  };
}

export function useNftDropMint() {
  const chainId = useChainId();
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const contractAddress = getContractAddress(chainId);

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync, isPending: isWriting } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const mint = useCallback(
    async (tokenId: number, quantity: number, mintPriceWei: bigint) => {
      if (!contractAddress || !address) {
        setError("Wallet not connected");
        return;
      }

      setError(null);
      setTxHash(undefined);

      try {
        const hash = await writeContractAsync({
          address: contractAddress,
          abi: GENESIS_PASS_ABI,
          functionName: "mint",
          args: [
            BigInt(tokenId),
            BigInt(quantity),
            BigInt(0), // maxQuantity (unused in PUBLIC)
            BigInt(0), // deadline (unused in PUBLIC)
            "0x" as `0x${string}`, // empty signature for PUBLIC
          ],
          value: mintPriceWei * BigInt(quantity),
        });
        setTxHash(hash);
      } catch (e: any) {
        const msg = e?.shortMessage || e?.message || "Transaction failed";
        if (msg.includes("StagePaused")) setError("Minting is currently paused.");
        else if (msg.includes("MintingEnded")) setError("Minting period has ended.");
        else if (msg.includes("SoldOut")) setError("This edition is sold out.");
        else if (msg.includes("WalletLimitExceeded")) setError("You have reached the mint limit for this stage.");
        else if (msg.includes("InvalidPayment")) setError("Incorrect payment amount.");
        else if (msg.includes("ContractMinter")) setError("Please use a regular wallet, not a smart contract.");
        else if (msg.includes("User rejected")) setError("Transaction cancelled.");
        else setError(msg);
      }
    },
    [contractAddress, address, writeContractAsync]
  );

  return {
    mint,
    txHash,
    error,
    isWriting,
    isConfirming,
    isSuccess,
    clearError: () => setError(null),
  };
}
