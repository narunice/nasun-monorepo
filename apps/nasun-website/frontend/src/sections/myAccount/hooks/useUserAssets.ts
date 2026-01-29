import { useWalletAccount } from "@nasun/wallet";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import { useEthereumNFTs } from "@/features/wallet";

interface UseUserAssetsProps {
  walletAddress?: string;
}

export const useUserAssets = ({ walletAddress }: UseUserAssetsProps) => {
  const suiAccount = useWalletAccount();

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

  return {
    suiAccount,
    suiObjects: filteredSuiObjects,
    ethObjects: filteredEthereumNFTs,
    suiError,
    ethError,
    isLoading: (isSuiPending || isEthPending) && !suiResponse && !ethereumNFTs,
  };
};
