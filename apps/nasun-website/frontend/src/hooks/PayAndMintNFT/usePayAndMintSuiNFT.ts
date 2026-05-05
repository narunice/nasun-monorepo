import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { useCallback, useRef, useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import { useWallet, useZkLogin, getSuiClient } from "@nasun/wallet";
import { toast } from "react-toastify";
import { useNetworkVariable } from "../../config/suiNetworkConfig";
import { useCoinPrice } from "./useCoinPrice";
import { NFTTiers, NFTTierDisplayNames } from "../../types/genesisNFTs.d";
import logger from "../../lib/logger";
import axios from "axios";

const SUI_DECIMALS = 9;

export const usePayAndMintSuiNFT = () => {
  const { t } = useTranslation("sale");
  const { status, account, getKeypair } = useWallet();
  const { isConnected: isZkConnected, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const packageId = useNetworkVariable("packageId");
  const supplyLimitId = useNetworkVariable("supplyLimitId");
  const { currentPrice } = useCoinPrice();
  const [error, setError] = useState<Error | null>(null);
  const [isPending, setIsPending] = useState(false);

  const isConnected = (status === "unlocked" && !!account) || isZkConnected;
  const walletAddress = account?.address || zkState?.address;

  const toastId = useRef<string | number>();

  const fetchRandomImage = useCallback(async (tier: NFTTiers): Promise<string> => {
    const tierKey = `TIER${tier}` as NFTTiers;
    const endpoint = import.meta.env.VITE_RANDOM_IMAGE_API_ENDPOINT;
    if (!endpoint) {
      throw new Error("VITE_RANDOM_IMAGE_API_ENDPOINT is not set in .env file");
    }
    try {
      const res = await axios.post(endpoint, { tier: tierKey });
      return res.data.imageUrl;
    } catch (err) {
      logger.error("Failed to fetch random image", err);
      if (axios.isAxiosError(err)) {
        throw new Error(err.response?.data?.error || "Failed to fetch random image");
      }
      throw new Error("Failed to fetch random image");
    }
  }, []);

  const payAndMintNFT = useCallback(
    async (tier: NFTTiers, usdPrice: number) => {
      const ERROR_MAP: Record<string, string> = {
        InsufficientCoinBalance: t("payAndMintNFT.errors.InsufficientCoinBalance"),
        EInsufficientFunds: t("payAndMintNFT.errors.EInsufficientFunds"),
        EAlreadyClaimed: t("payAndMintNFT.errors.EAlreadyClaimed"),
        EInvalidPrice: t("payAndMintNFT.errors.EInvalidPrice"),
        "User rejected the request": t("payAndMintNFT.errors.userRejected"),
      };

      const getErrorMessage = (error: string | Error): string => {
        if (typeof error !== "string") {
          error = error.message;
        }
        for (const [key, value] of Object.entries(ERROR_MAP)) {
          if (error.includes(key)) {
            return value;
          }
        }
        if (error.includes("ESupplyExceeded")) {
          return t("payAndMintNFT.errors.supplyExceeded");
        } else if (error.includes("EInsufficientFunds")) {
          return t("payAndMintNFT.errors.insufficientFunds");
        }
        return error;
      };

      if (!isConnected || !walletAddress) {
        toast.error(t("payAndMintNFT.errors.walletRequired"));
        throw new Error(t("payAndMintNFT.errors.walletNotConnected"));
      }

      const tierDisplayName = NFTTierDisplayNames[tier];
      setIsPending(true);

      try {
        const fetchingId = toast.loading(t("payAndMintNFT.messages.fetchingImage"), {
          autoClose: false,
          closeOnClick: false,
        });

        setTimeout(() => {
          toast.dismiss(fetchingId);
        }, 3500);

        const randomImageUrl = await fetchRandomImage(tier);

        if (typeof currentPrice !== "number" || currentPrice <= 0) {
          logger.error("Invalid SUI price:", currentPrice);
          throw new Error(t("payAndMintNFT.errors.fetchPriceFailed"));
        }

        const numericValue = (usdPrice / currentPrice) * 10 ** SUI_DECIMALS;
        const convertedPrice = Math.floor(numericValue);

        if (isNaN(convertedPrice) || convertedPrice <= 0) {
          logger.error("Invalid conversion:", {
            usdPrice,
            currentPrice,
            numericValue,
            convertedPrice,
          });
          throw new Error(t("payAndMintNFT.errors.priceConversionFailed"));
        }

        const tx = new Transaction();
        const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(convertedPrice))]);
        tx.moveCall({
          target: `${packageId}::founders_nft::pay_and_mint_tier${tier}_nft`,
          arguments: [
            payment,
            tx.pure.u64(BigInt(convertedPrice)),
            tx.object(supplyLimitId),
            tx.pure.string(randomImageUrl),
          ],
        });

        toastId.current = toast.loading(
          t("payAndMintNFT.messages.minting", { tier: tierDisplayName }),
          {
            autoClose: false,
            closeOnClick: false,
          }
        );

        const suiClient = getSuiClient();
        let result;

        // zkLogin signing path
        if (isZkConnected && zkState) {
          tx.setSender(zkState.address);
          const bytes = await tx.build({ client: suiClient });
          const signature = await zkSignTransaction(bytes);
          result = await suiClient.executeTransactionBlock({
            transactionBlock: bytes,
            signature,
            options: { showEffects: true, showEvents: true },
          });
        } else {
          // Mnemonic wallet signing path
          const keypair = getKeypair();
          if (!keypair) {
            throw new Error("Failed to get keypair");
          }
          result = await suiClient.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx,
            options: { showEffects: true, showEvents: true },
          });
        }

        const txResult = await suiClient.waitForTransaction({
          digest: result.digest,
          options: { showEvents: true, showEffects: true },
        });

        logger.log("Transaction result:", txResult);
        logger.log("All events:", txResult.events);

        if (txResult.effects?.status?.status === "failure") {
          const errorCode = txResult.effects.status.error;
          throw new Error(errorCode);
        }

        toast.update(toastId.current!, {
          render: t("payAndMintNFT.messages.success", { tier: tierDisplayName }),
          type: "success",
          isLoading: false,
          autoClose: 4000,
        });

        const expectedEventType = `${packageId}::founders_nft::NFTMinted`;
        const mintEvent = txResult.events?.find((e) => e.type === expectedEventType);
        const parsed = mintEvent?.parsedJson as
          | {
              object_id: string;
              tier: number;
              minter: string;
              count: string;
              payment_amount: string;
              image_url: string;
            }
          | undefined;

        if (parsed && window.__GENESIS_NFT_MODAL?.setNFTData) {
          window.__GENESIS_NFT_MODAL.setNFTData({
            objectId: parsed.object_id,
            tier: parsed.tier,
            minter: parsed.minter,
            count: Number(parsed.count),
            paymentAmount: parsed.payment_amount,
            imageUrl: parsed.image_url,
            txId: result.digest,
          });
        } else if (window.__GENESIS_NFT_MODAL?.openEmptyModal) {
          window.__GENESIS_NFT_MODAL.openEmptyModal(result.digest);
        }

        return {
          txId: result.digest,
          nftId: parsed?.object_id ?? result.digest,
          imageUrl: randomImageUrl,
        };
      } catch (e) {
        const errorMessage = getErrorMessage(
          typeof e === "string" ? e : e instanceof Error ? e.message : String(e)
        );

        toast.update(toastId.current!, {
          render: `${t("payAndMintNFT.errors.failed")} ${errorMessage}`,
          type: "error",
          isLoading: false,
          autoClose: 4000,
        });

        window.__GENESIS_NFT_MODAL?.closeModal?.();
        const errObj = e instanceof Error ? e : new Error(errorMessage);
        setError(errObj);
        throw errObj;
      } finally {
        setIsPending(false);
      }
    },
    [
      isConnected,
      walletAddress,
      isZkConnected,
      zkState,
      zkSignTransaction,
      getKeypair,
      t,
      fetchRandomImage,
      currentPrice,
      packageId,
      supplyLimitId,
    ]
  );

  return { payAndMintNFT, isPending, error };
};
