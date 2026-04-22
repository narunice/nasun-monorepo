import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId, useSwitchChain } from "wagmi";
import { formatEther } from "viem";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  GENESIS_PASS_ABI,
  GENESIS_PASS_CHAIN_ID,
  GENESIS_PASS_CONTRACT,
} from "@/constants/genesis-pass-contract";
import { requestMintSignature, GenesisPassApiError } from "@/services/genesisPassApi";
import { useUserStore } from "@/store/userStore";

const RATE_LIMIT_COOLDOWN_MS = 60_000;

export function useNftDropRead() {
  const { address } = useAccount();
  const contractAddress = GENESIS_PASS_CONTRACT;

  const { data: currentStage } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "currentStage",
    chainId: GENESIS_PASS_CHAIN_ID,
    query: { refetchInterval: 30_000, refetchOnWindowFocus: true },
  });

  const { data: currentMintPrice } = useReadContract({
    address: contractAddress,
    abi: GENESIS_PASS_ABI,
    functionName: "currentMintPrice",
    chainId: GENESIS_PASS_CHAIN_ID,
    query: { refetchInterval: 30_000 },
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

  // walletLimit of 0 means "no limit set" -- treat as unlimited
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

const STAGE_PUBLIC = 4;

export function useNftDropMint() {
  const chainId = useChainId();
  const { address } = useAccount();
  const contractAddress = GENESIS_PASS_CONTRACT;
  const cognitoToken = useUserStore((s) => s.user?.cognitoToken); // kept for isLoggedIn
  const { switchChainAsync } = useSwitchChain();
  // Read on-chain stage directly for mint logic (immune to UI overrides)
  const { currentStage: onChainStage } = useNftDropRead();

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isFetchingSignature, setIsFetchingSignature] = useState(false);
  const mintingRef = useRef(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // Cache the last signature to reuse on MetaMask reject/failure (valid for 5 min)
  const sigCacheRef = useRef<{
    wallet: string;
    stage: number;
    maxQuantity: bigint;
    deadline: bigint;
    signature: `0x${string}`;
    fetchedAt: number;
  } | null>(null);

  const { writeContractAsync, isPending: isWriting } = useWriteContract();

  const { isLoading: isConfirming, isSuccess, isError: isReceiptError } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Countdown timer for rate-limit cooldown
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownRemaining(remaining);
      if (remaining <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const isCooldown = cooldownRemaining > 0;

  // Surface on-chain revert as user-facing error
  useEffect(() => {
    if (isReceiptError && txHash) {
      setError("Transaction failed on-chain. Please try again.");
    }
  }, [isReceiptError, txHash]);

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

      // Switch to Ethereum mainnet if needed (GP is mainnet-only)
      if (chainId !== GENESIS_PASS_CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: GENESIS_PASS_CHAIN_ID });
        } catch {
          setError("Please switch to Ethereum Mainnet in your wallet and try again.");
          return;
        }
      }

      const resolvedAddress = GENESIS_PASS_CONTRACT;

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
          // Reuse cached signature if still valid (4 min buffer before 5 min expiry)
          const cached = sigCacheRef.current;
          const SIG_REUSE_TTL = 4 * 60 * 1000; // 4 minutes
          if (
            cached &&
            cached.wallet.toLowerCase() === address.toLowerCase() &&
            cached.stage === currentStage &&
            Date.now() - cached.fetchedAt < SIG_REUSE_TTL
          ) {
            maxQuantity = cached.maxQuantity;
            deadline = cached.deadline;
            signature = cached.signature;
          } else {
            setIsFetchingSignature(true);
            try {
              const sigResponse = await requestMintSignature(address);
              const sigData = sigResponse.data;

              // Wallet mismatch guard (server returns checksummed address)
              if (sigData.walletAddress.toLowerCase() !== address.toLowerCase()) {
                setError(`Wallet mismatch. Please reconnect your wallet.`);
                return;
              }

              maxQuantity = BigInt(sigData.maxQuantity);
              deadline = BigInt(sigData.deadline);
              signature = sigData.signature as `0x${string}`;

              // Cache for reuse
              sigCacheRef.current = {
                wallet: address,
                stage: currentStage,
                maxQuantity,
                deadline,
                signature,
                fetchedAt: Date.now(),
              };
            } catch (e) {
              if (e instanceof GenesisPassApiError) {
                if (e.statusCode === 403) setError("Not eligible for current stage. The stage may have changed.");
                else if (e.statusCode === 429 && e.errorCode === "RATE_LIMITED") {
                  const until = Date.now() + RATE_LIMIT_COOLDOWN_MS;
                  setCooldownUntil(until);
                  setCooldownRemaining(Math.ceil(RATE_LIMIT_COOLDOWN_MS / 1000));
                  setError("Please wait 60 seconds before requesting another signature.");
                }
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
          chainId: GENESIS_PASS_CHAIN_ID,
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
        else if (msg.includes("SignatureExpired")) setError("Signature expired (5 min limit). Please click Mint again to get a fresh signature.");
        else if (msg.includes("User rejected")) setError("Transaction cancelled.");
        else if (msg.includes("does not match the target chain")) setError("Wrong network. Please switch to Ethereum Mainnet in your wallet and try again.");
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
    isCooldown,
    cooldownRemaining,
    clearError: () => { setError(null); setTxHash(undefined); },
  };
}
