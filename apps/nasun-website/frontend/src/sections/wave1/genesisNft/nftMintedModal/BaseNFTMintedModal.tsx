// BaseNFTMintedModal.tsx

import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useTierSupplyCount } from "../../../../hooks/PayAndMintNFT/useTierSupplyCount";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogTitle,
} from "@/components/ui/dialog"; // Use project's custom Dialog component
import { NFTMintedEvent } from "../../../../types/genesisNFTs.d";
import { getMaxSupply } from "../../../../utils/nftUtils";
import { Button } from "@/components/ui/button";
import { InlineLoading } from "@/components/ui/InlineLoading";

interface BaseNFTMintedModalProps {
  open: boolean;
  onClose: () => void;
  isLoading: boolean;
  latestEvent: NFTMintedEvent | null;
  getTierDisplayName: (tier: number) => string;
  explorerUrl: string;
  currencySymbol: string;
  networkName: string;
}

export const BaseNFTMintedModal = ({
  open,
  onClose,
  isLoading,
  latestEvent,
  getTierDisplayName,
  explorerUrl,
  currencySymbol,
  networkName,
}: BaseNFTMintedModalProps) => {
  const { t } = useTranslation("sale");

  const [imageLoaded, setImageLoaded] = useState(false);

  const handleImageLoad = () => setImageLoaded(true);
  const handleImageError = () => setImageLoaded(true); // 에러 시에도 로딩 아이콘 제거

  // -------------------------------------------------------------------
  // 1) latestEvent.tier → 순수 숫자로 변환
  // -------------------------------------------------------------------
  const rawTier = latestEvent?.tier;
  const tierNum = typeof rawTier === "number" ? rawTier : parseInt(String(rawTier), 10) || 0;

  // -------------------------------------------------------------------
  // 2) useTierSupplyCount에는 "1", "2", ... 형태의 문자열 전달
  // -------------------------------------------------------------------
  const tierKey = tierNum > 0 ? String(tierNum) : "";

  const { currentCount, isLoading: isSupplyLoading } = useTierSupplyCount(tierKey);

  // -------------------------------------------------------------------
  // 3) 렌더링 가드
  // -------------------------------------------------------------------
  if (!open || !latestEvent) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogOverlay className="fixed inset-0  bg-white/50 backdrop-blur-md z-50" />
      <DialogContent className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[450px] max-h-[85vh] bg-gray-800 rounded-lg shadow-xl z-50 overflow-auto p-6">
        <DialogDescription className="sr-only">
          {t("minted_modal.sr_only_description")}
        </DialogDescription>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <DialogTitle className="text-center text-2xl font-bold mb-4">
              {t("minted_modal.minting_successful")}
            </DialogTitle>
            <InlineLoading message={t("minted_modal.loading_nft_details")} size="lg" />
          </div>
        ) : (
          <>
            <DialogTitle className="text-center text-2xl font-bold mb-3">
              {t("minted_modal.your_nft_details")}
            </DialogTitle>

            {/* NFT 이미지 렌더링 */}
            {!imageLoaded && latestEvent.imageUrl && (
              <div className="w-full max-h-28 md:max-h-32 lg:max-h-36 flex items-center justify-center mb-3">
                <InlineLoading size="md" />
              </div>
            )}

            {latestEvent.imageUrl && (
              <img
                src={latestEvent.imageUrl}
                alt={`Tier ${latestEvent.tier} NFT`}
                className={`w-full max-h-28 md:max-h-32 lg:max-h-36 object-contain rounded-lg mb-3 ${
                  imageLoaded ? "block" : "hidden"
                }`}
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
            )}

            <div className="grid gap-4 py-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{t("minted_modal.network")}</span>
                <span>{networkName}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-semibold">{t("minted_modal.tier")}</span>
                <span>{getTierDisplayName(tierNum)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-semibold">{t("minted_modal.minter")}</span>
                <span>
                  {latestEvent.minter.slice(0, 6)}...
                  {latestEvent.minter.slice(-4)}
                </span>
              </div>

              {/* Count 부분 */}
              <div className="flex items-center justify-between">
                <span className="font-semibold">{t("minted_modal.count")}</span>
                <div>
                  <span>{isSupplyLoading ? t("message.loading_supply") : `#${currentCount}`}</span>
                  <span>/ {getMaxSupply(tierNum) || "N/A"}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-semibold">{t("minted_modal.price")}</span>
                <span>
                  {(Number(latestEvent.paymentAmount) / 1_000_000_000).toFixed(3)} {currencySymbol}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-semibold">{t("minted_modal.object_id")}</span>
              <span>
                {latestEvent.objectId.slice(0, 6)}...
                {latestEvent.objectId.slice(-4)}
              </span>
            </div>

            <div className="mt-6 flex justify-center gap-3">
              {/* <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg px-3 py-1 
                 text-gray-200 bg-gray-700 hover:bg-gray-600 hover:text-gray-100 
                 bg-gray-300 text-gray-800 hover:bg-gray-200 hover:text-gray-700 
                 cursor-pointer transition-all border border-gray-400
                 focus:outline-none"
              >
                {t("minted_modal.view_on_explorer")}
              </a> */}
              <Button
                variant="c2"
                onClick={() => window.open(explorerUrl, "_blank", "noopener,noreferrer")}
                className="w-1/2"
              >
                {t("minted_modal.view_on_explorer")}
              </Button>

              <Button variant="default" onClick={onClose} className="w-1/2">
                {t("minted_modal.close")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
