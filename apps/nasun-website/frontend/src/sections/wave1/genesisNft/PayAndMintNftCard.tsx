import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NFT_COLLECTION } from "../../../constants/pageContent/genesisNFTTiers";
import { NFTTiers, TierData } from "../../../types/genesisNFTs.d";
import { usePayAndMintSuiNFT } from "../../../hooks/PayAndMintNFT/usePayAndMintSuiNFT";
import { useCurrentWallet as useCurrentSuiWallet } from "@mysten/dapp-kit";
import { PriceConverter } from "./PriceConverter";
import { ConnectSuiWallet } from "@/features/wallet";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";

interface PayAndMintNftCardProps {
  tierData?: TierData;
  tier: NFTTiers;
  currentSupply?: number;
  isSupplyLoading: boolean;
}

function PayAndMintNftCardComponent({ tierData, tier, currentSupply, isSupplyLoading }: PayAndMintNftCardProps) {
  const { t } = useTranslation("sale");
  const maxSupply = NFT_COLLECTION[tier].MAX_SUPPLY;
  const isSoldOut = !isSupplyLoading && currentSupply !== undefined && currentSupply >= maxSupply;
  const isSupplyUnknown = !isSupplyLoading && currentSupply === undefined;

  const [showConnectAlert, setShowConnectAlert] = useState(false);
  const suiWallet = useCurrentSuiWallet();
  const { payAndMintNFT, isPending } = usePayAndMintSuiNFT();

  useEffect(() => {
    if (showConnectAlert && suiWallet.isConnected) {
      setShowConnectAlert(false);
      toast.success(t("toast.connected_well"), { autoClose: 3000 });
    }
  }, [suiWallet.isConnected, showConnectAlert, t]);

  const validateTierData = () => !!tierData;

  const validateWalletConnection = () => {
    if (!suiWallet.isConnected) {
      toast.info(t("toast.wallet_required"), { autoClose: 3000 });
      return false;
    }
    return true;
  };

  const mintNFT = async () => {
    try {
      const result = await payAndMintNFT(tier, tierData!.USD_PRICE);
      if (result && result.txId) {
        window.__GENESIS_NFT_MODAL_SUI?.openEmptyModal?.(result.txId);
      }
    } catch (error) {
      console.error("SUI Minting failed:", error);
    }
  };

  const handleMint = async () => {
    if (isSupplyLoading) {
      toast.info(t("message.loading_supply"), { autoClose: 2000 });
      return;
    }
    if (isSoldOut) {
      toast.error(t("message.sold_out"), { autoClose: 3000 });
      return;
    }
    if (!validateTierData() || !validateWalletConnection()) return;
    await mintNFT();
  };

  if (!tierData) {
    return (
      <div className="flex flex-col gap-4 w-full">
        <div className="flex flex-col border-gray-600 border p-3">
          <div className="animate-pulse text-gray-400">{t("message.loading_nft")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col border-gray-600 border p-3">
        <div className="flex flex-wrap md:flex-nowrap w-full pb-3 justify-between">
          <span className="self-center mr-4 text-nowrap">
            {suiWallet.isConnected ? t("switch") : t("status")}
          </span>
          <ConnectSuiWallet />
        </div>

        <PriceConverter usdPrice={tierData.USD_PRICE} />

        <Button
          variant="default"
          onClick={handleMint}
          disabled={isPending || isSupplyLoading || isSoldOut || isSupplyUnknown}
          className="w-full"
        >
          {isSupplyLoading
            ? t("message.loading_supply")
            : isSupplyUnknown
            ? t("message.supply_unavailable")
            : isSoldOut
            ? t("message.sold_out")
            : isPending
            ? t("message.processing")
            : t("mint")}
        </Button>
      </div>
    </div>
  );
}

export const PayAndMintNftCard = React.memo(PayAndMintNftCardComponent);
