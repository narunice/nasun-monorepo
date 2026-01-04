import { useSuiClientQuery } from "@mysten/dapp-kit";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { useWallet, useZkLogin } from "@nasun/wallet";

export const useVoteNfts = () => {
  // Support both regular wallet and zkLogin
  const { account } = useWallet();
  const { state: zkLoginState } = useZkLogin();
  const packageId = useNetworkVariable("packageId");

  // Use wallet address or zkLogin address
  const ownerAddress = account?.address || zkLoginState?.address;

  return useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: ownerAddress as string,
      options: {
        showContent: true,
      },
      filter: {
        StructType: `${packageId}::proposal::VoteProofNFT`,
      },
    },
    {
      enabled: !!ownerAddress,
    }
  );
};
