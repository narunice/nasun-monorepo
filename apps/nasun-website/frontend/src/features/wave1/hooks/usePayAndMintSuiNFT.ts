import { useTranslation } from "react-i18next";
import { useCallback, useRef, useState } from "react";
import { Transaction } from "@mysten/sui/transactions";
import {
  useSignAndExecuteTransaction,
  useCurrentAccount,
  useCurrentWallet,
  useSuiClient,
} from "@mysten/dapp-kit";
import { toast } from "react-toastify";
import { useNetworkVariable } from "../../config/suiNetworkConfig";
import { useCoinPrice } from "./useCoinPrice";
import { NFTTiers, NFTTierDisplayNames } from "../../types/foundersNFTs.d";
import logger from "../../lib/logger"; // Import logger
import axios from "axios";

const SUI_DECIMALS = 9;

export const usePayAndMintSuiNFT = () => {
  const { t } = useTranslation("sale");
  const client = useSuiClient();
  const { connectionStatus } = useCurrentWallet();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const account = useCurrentAccount();
  const packageId = useNetworkVariable("packageId");
  const supplyLimitId = useNetworkVariable("supplyLimitId");
  const { currentPrice } = useCoinPrice();
  const [error, setError] = useState<Error | null>(null);

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

      if (connectionStatus !== "connected" || !account) {
        toast.error(t("payAndMintNFT.errors.walletRequired"));
        throw new Error(t("payAndMintNFT.errors.walletNotConnected"));
      }

      const tierDisplayName = NFTTierDisplayNames[tier];

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

        const result = await signAndExecute({ transaction: tx });

        const txResult = await client.waitForTransaction({
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

        if (parsed && window.__FOUNDERS_NFT_MODAL?.setNFTData) {
          window.__FOUNDERS_NFT_MODAL.setNFTData({
            objectId: parsed.object_id,
            tier: parsed.tier,
            minter: parsed.minter,
            count: Number(parsed.count),
            paymentAmount: parsed.payment_amount,
            imageUrl: parsed.image_url,
            txId: result.digest,
          });
        } else if (window.__FOUNDERS_NFT_MODAL?.openEmptyModal) {
          window.__FOUNDERS_NFT_MODAL.openEmptyModal(result.digest);
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

        window.__FOUNDERS_NFT_MODAL?.closeModal?.();
        const errObj = e instanceof Error ? e : new Error(errorMessage);
        setError(errObj);
        throw errObj;
      }
    },
    [
      connectionStatus,
      account,
      t,
      fetchRandomImage,
      currentPrice,
      packageId,
      supplyLimitId,
      signAndExecute,
      client,
    ]
  );

  return { payAndMintNFT, isPending, error };
};