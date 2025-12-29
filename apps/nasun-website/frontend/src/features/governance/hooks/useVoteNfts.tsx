import { useSuiClientQuery } from "@mysten/dapp-kit";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { useWallet } from "@nasun/wallet";

export const useVoteNfts = () => {
  // Use @nasun/wallet instead of Sui dApp Kit's useCurrentAccount
  const { account } = useWallet();
  const packageId = useNetworkVariable("packageId");

  return useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: account?.address as string,
      options: {
        showContent: true,
      },
      filter: {
        StructType: `${packageId}::proposal::VoteProofNFT`,
      },
    },
    {
      enabled: !!account?.address,
    }
  );
};
