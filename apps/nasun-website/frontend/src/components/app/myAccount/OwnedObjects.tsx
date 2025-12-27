// OwnedObjects.tsx
// Simplified after IOTA removal

import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useCurrentAccount as useCurrentSuiAccount, useSuiClientQuery } from "@mysten/dapp-kit";
import { SuiObject } from "./SuiObjects";
import { EthereumNFT } from "./EthereumNFT";
import { useEthereumNFTs } from "../../../hooks/wallet/useEthereumNFTs";

interface OwnedObjectsProps {
  walletAddress?: string;
}

export const OwnedObjects = ({ walletAddress }: OwnedObjectsProps) => {
  const { t } = useTranslation("myAccount");
  const suiAccount = useCurrentSuiAccount();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Sui 오브젝트 쿼리
  const {
    data: suiResponse,
    error: suiError,
    isPending: isSuiPending,
  } = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: suiAccount?.address as string,
      options: {
        showType: true,
        showOwner: true,
        showContent: true,
        showDisplay: true,
      },
    },
    {
      enabled: !!suiAccount,
    }
  );

  // Ethereum NFT 쿼리
  const {
    data: ethereumNFTs,
    error: ethError,
    isPending: isEthPending,
  } = useEthereumNFTs(walletAddress);

  if (!suiAccount && !walletAddress) {
    return (
      <p className="text-nasun-white/70 !text-sm mb-4">
        {t("walletNotConnected")}
      </p>
    );
  }

  const filterStrings = import.meta.env.VITE_FILTER_STRINGS?.split(",") || [];

  // Sui 오브젝트 필터링
  const filteredSuiObjects =
    suiAccount && suiResponse?.data
      ? suiResponse.data.filter((objectRes) => {
          return (
            objectRes.data?.type &&
            filterStrings.some((filter: string) => objectRes.data?.type!.includes(filter))
          );
        })
      : [];

  // Ethereum NFT 필터링
  const filterContracts = import.meta.env.VITE_ETHEREUM_NFT_FILTER_CONTRACTS?.split(",") || [];
  const filteredEthereumNFTs =
    filterContracts.length > 0 && ethereumNFTs
      ? ethereumNFTs.filter((nft) =>
          filterContracts.some(
            (addr: string) => nft.contractAddress.toLowerCase() === addr.toLowerCase()
          )
        )
      : ethereumNFTs || [];

  // 모든 오브젝트를 네트워크별로 분리하여 저장
  const suiObjects = filteredSuiObjects;
  const ethObjects = filteredEthereumNFTs;

  const noObjectsFound = suiObjects.length === 0 && ethObjects.length === 0;

  // 페이지네이션
  const suiTotalPages = Math.ceil(suiObjects.length / itemsPerPage);
  const totalPages = suiTotalPages;

  const suiStartIndex = (currentPage - 1) * itemsPerPage;
  const suiEndIndex = suiStartIndex + itemsPerPage;
  const paginatedSuiObjects = suiObjects.slice(suiStartIndex, suiEndIndex);

  const handlePageClick = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // 로딩 및 에러 상태
  if ((isSuiPending || isEthPending) && !suiResponse && !ethereumNFTs) {
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

  return (
    <div className="flex flex-col space-y-2">
      {noObjectsFound && (
        <p className="pt-8 text-gray-400">{t("myAssets.noObject")}</p>
      )}

      <div className="space-y-4 text-gray-300">
        {/* Ethereum NFT 표시 */}
        {walletAddress && ethObjects.length > 0 && (
          <div className="mb-8">
            <h4 className="text-lg font-semibold mb-4 text-gray-200">
              {t("myAssets.ethereumNFTs", "Ethereum NFTs")}
            </h4>
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
            <h4 className="text-lg font-semibold mb-4 text-gray-200">
              {t("myAssets.suiObjects", "Sui Objects")}
            </h4>
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
