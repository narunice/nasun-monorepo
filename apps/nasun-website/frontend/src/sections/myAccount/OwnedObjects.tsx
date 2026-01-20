// OwnedObjects.tsx
// Simplified after IOTA removal

import { useTranslation } from "react-i18next";
import { useState } from "react";
import { SuiObject } from "./SuiObjects";
import { EthereumNFT } from "./EthereumNFT";
import { useUserAssets } from "./hooks/useUserAssets";

interface OwnedObjectsProps {
  walletAddress?: string;
}

export const OwnedObjects = ({ walletAddress }: OwnedObjectsProps) => {
  const { t } = useTranslation("myAccount");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const {
    suiAccount,
    suiObjects,
    ethObjects,
    suiError,
    ethError,
    isLoading,
  } = useUserAssets({ walletAddress });

  if (!suiAccount && !walletAddress) {
    return (
      <p className="text-nasun-white/70 mb-4">
        {t("walletNotConnected")}
      </p>
    );
  }

  // 로딩 및 에러 상태
  if (isLoading) {
    return <div className="flex">{t("loading")}</div>;
  }

  if (suiError || ethError) {
    return (
      <div className="flex flex-col gap-2">
        {suiError && (
          <p className="text-nasun-latte">
            {t("loadingSui")}: {suiError.message}
          </p>
        )}
        {ethError && (
          <p className="text-nasun-latte">
            {t("loadingEthereum", "Loading Ethereum")}: {ethError.message}
          </p>
        )}
      </div>
    );
  }

  const noObjectsFound = suiObjects.length === 0 && ethObjects.length === 0;

  // 페이지네이션
  const totalPages = Math.ceil(suiObjects.length / itemsPerPage);
  const suiStartIndex = (currentPage - 1) * itemsPerPage;
  const suiEndIndex = suiStartIndex + itemsPerPage;
  const paginatedSuiObjects = suiObjects.slice(suiStartIndex, suiEndIndex);

  const handlePageClick = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="flex flex-col space-y-2">
      {noObjectsFound && (
        <p className="pt-8 text-gray-400">{t("myAssets.noObject")}</p>
      )}

      <div className="space-y-4 text-gray-300">
        {/* Ethereum NFT 표시 */}
        {walletAddress && ethObjects.length > 0 && (
          <div className="mb-8">
            <h6 className="font-semibold mb-4 text-gray-200">
              {t("myAssets.ethereumNFTs", "Ethereum NFTs")}
            </h6>
            <div className="space-y-4">
              {ethObjects.map((nft) => (
                <EthereumNFT
                  key={`eth-${nft.contractAddress}-${nft.tokenId}`}
                  nft={nft}
                />
              ))}
            </div>
          </div>
        )}

        {/* Sui 오브젝트 표시 */}
        {suiAccount && paginatedSuiObjects.length > 0 && (
          <div className="mb-8">
            <h6 className="font-semibold mb-4 text-gray-200">
              {t("myAssets.suiObjects", "Sui Objects")}
            </h6>
            <div className="space-y-4">
              {paginatedSuiObjects.map((objectRes) => (
                <SuiObject key={`sui-${objectRes.data?.objectId}`} objectRes={objectRes} />
              ))}
            </div>
          </div>
        )}
      </div>

      {suiObjects.length > itemsPerPage && (
        <div className="flex justify-center items-center space-x-2 pt-6">
          <button
            onClick={() => handlePageClick(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded-lg border border-gray-800 disabled:opacity-50"
          >
            &lt;
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => handlePageClick(page)}
              className={`px-3 py-1 rounded-lg border border-gray-800 ${
                currentPage === page
                  ? "bg-gray-200 text-black"
                  : "bg-black"
              }`}
            >
              {page}
            </button>
          ))}

          <button
            onClick={() => handlePageClick(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded-lg border border-gray-800 disabled:opacity-50"
          >
            &gt;
          </button>
        </div>
      )}
    </div>
  );
};