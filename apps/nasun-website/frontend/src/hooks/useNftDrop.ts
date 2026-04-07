import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId, useSwitchChain } from "wagmi";
import { formatEther } from "viem";
import { useState, useCallback, useRef } from "react";
import { GENESIS_PASS_ABI, GENESIS_PASS_ADDRESSES } from "@/constants/genesis-pass-contract";
import { requestMintSignature, GenesisPassApiError } from "@/services/genesisPassApi";
import { useUserStore } from "@/store/userStore";

function getContractAddress(chainId: number): `0x${string}` | undefined {
  const addr = GENESIS_PASS_ADDRESSES[chainId];
  return addr ? (addr as `0x${string}`) : undefined;
}

export function useNftDropRead() {
  const chainId = useChainId();
  const { address } = useAccount();
  const contractAddress = getContractAddress(chainId);

  const { data: currentStage } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "currentStage",
    query: { refetchInterval: 15_000, refetchOnWindowFocus: true },
  });

  const { data: currentMintPrice } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "currentMintPrice",
    query: { refetchInterval: 15_000 },
  });

  const { data: mintDeadline } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "mintDeadline",
  });

  const { data: transfersUnlocked } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "transfersUnlocked",
  });

  const stageNum = currentStage != null ? Number(currentStage) : 0;

  const { data: mintedCount } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "mintedPerStage",
    args: [stageNum, address!],
    query: { enabled: !!address && stageNum > 0 },
  });

  const { data: walletLimit } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "walletLimitPerStage",
    args: [stageNum],
    query: { enabled: stageNum > 0 },
  });

  const hasReachedLimit =
    mintedCount != null && walletLimit != null && (mintedCount as bigint) >= (walletLimit as bigint);

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

const STAGE_PUBLIC = 4;

export function useNftDropMint() {
  const chainId = useChainId();
  const { address } = useAccount();
  const contractAddress = getContractAddress(chainId);
  const cognitoToken = useUserStore((s) => s.userData?.cognitoToken);
  const { switchChainAsync } = useSwitchChain();
  // Read on-chain stage directly for mint logic (immune to UI overrides)
  const { currentStage: onChainStage } = useNftDropRead();

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isFetchingSignature, setIsFetchingSignature] = useState(false);
  const mintingRef = useRef(false);

  const { writeContractAsync, isPending: isWriting } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const mint = useCallback(
    async (tokenId: number, mintPriceWei: bigint, _displayStage: number) => {
      if (mintingRef.current) return;
      mintingRef.current = true;
      // Use on-chain stage for all mint logic (ignores UI dev overrides)
      const currentStage = onChainStage;
      try {
      if (!address) {
        setError("Wallet not connected");
        return;
      }

      // Switch to correct chain if needed
      const expectedChainId = Number(import.meta.env.VITE_ETHEREUM_CHAIN_ID);
      if (!expectedChainId) {
        setError("Network configuration error. Please contact support.");
        return;
      }
      if (chainId !== expectedChainId) {
        try {
          await switchChainAsync({ chainId: expectedChainId });
        } catch {
          setError("Please switch to the correct network to mint.");
          return;
        }
      }

      // Resolve contract address from expected chain (not stale closure)
      const resolvedAddress = getContractAddress(expectedChainId);
      if (!resolvedAddress) {
        setError("Contract not available on this network.");
        return;
      }

      // Prevent minting with 0 price on paid stages
      if (currentStage > 1 && currentStage !== STAGE_PUBLIC && mintPriceWei === 0n) {
        setError("Mint price is not available yet. Please try again shortly.");
        return;
      }

      setError(null);
      setTxHash(undefined);

      try {
        let maxQuantity = BigInt(0);
        let deadline = BigInt(0);
        let signature: `0x${string}` = "0x";

        // Stages 1-3 require server-issued EIP-712 signature
        if (currentStage !== STAGE_PUBLIC) {
          if (!cognitoToken) {
            setError("Please log in to your Nasun account to mint during this stage.");
            return;
          }

          setIsFetchingSignature(true);
          try {
            const sigResponse = await requestMintSignature(cognitoToken);
            const sigData = sigResponse.data;

            // Wallet mismatch guard
            if (sigData.walletAddress.toLowerCase() !== address.toLowerCase()) {
              setError(`Connected wallet does not match your registered wallet. Please switch to ${sigData.walletAddress}.`);
              return;
            }

            maxQuantity = BigInt(sigData.maxQuantity);
            deadline = BigInt(sigData.deadline);
            signature = sigData.signature as `0x${string}`;
          } catch (e) {
            if (e instanceof GenesisPassApiError) {
              if (e.statusCode === 401) setError("Session expired. Please log in again.");
              else if (e.statusCode === 403) setError("Not eligible for current stage. The stage may have changed.");
              else setError(e.message);
            } else if (e instanceof DOMException && e.name === "AbortError") {
              setError("Request timed out. Please try again.");
            } else {
              setError("Failed to prepare mint. Please try again.");
            }
            return;
          } finally {
            setIsFetchingSignature(false);
          }
        }

        const hash = await writeContractAsync({
          address: resolvedAddress,
          abi: GENESIS_PASS_ABI,
          functionName: "mint",
          args: [
            BigInt(tokenId),
            BigInt(1), // quantity always 1
            maxQuantity,
            deadline,
            signature,
          ],
          value: mintPriceWei,
        });
        setTxHash(hash);
      } catch (e: any) {
        const msg = e?.shortMessage || e?.message || "Transaction failed";
        if (msg.includes("StagePaused")) setError("Minting is currently paused.");
        else if (msg.includes("MintingEnded")) setError("Minting period has ended.");
        else if (msg.includes("SoldOut")) setError("This edition is sold out.");
        else if (msg.includes("WalletLimitExceeded")) setError("You have reached the mint limit.");
        else if (msg.includes("InvalidPayment")) setError("Incorrect payment amount.");
        else if (msg.includes("ContractMinter")) setError("Please use a regular wallet, not a smart contract.");
        else if (msg.includes("TransfersLocked")) setError("Transfers are locked during the minting period.");
        else if (msg.includes("StageNotPriced")) setError("Stage price not configured.");
        else if (msg.includes("InvalidSignature")) setError("Signature verification failed. Please try again.");
        else if (msg.includes("SignatureExpired")) setError("Signature expired. Please try again.");
        else if (msg.includes("User rejected")) setError("Transaction cancelled.");
        else setError(msg);
      }
      } finally {
        mintingRef.current = false;
      }
    },
    [contractAddress, address, chainId, writeContractAsync, cognitoToken, switchChainAsync, onChainStage]
  );

  return {
    mint,
    txHash,
    error,
    isWriting,
    isFetchingSignature,
    isConfirming,
    isSuccess,
    isLoggedIn: !!cognitoToken,
    clearError: () => { setError(null); setTxHash(undefined); },
  };
}
