import { useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { fetchAllOwnedObjects } from "../utils/ownedObjects";

const VOTE_NFTS_QUERY_KEY = "governance-vote-nfts";

export const useVoteNfts = () => {
  const suiClient = useSuiClient();
  // Support both regular wallet and zkLogin
  const { account } = useWallet();
  const { state: zkLoginState } = useZkLogin();
  const originalPackageId = useNetworkVariable("originalPackageId");

  // Use wallet address or zkLogin address
  const ownerAddress = account?.address || zkLoginState?.address;

  return useQuery({
    queryKey: [VOTE_NFTS_QUERY_KEY, ownerAddress, originalPackageId],
    queryFn: () =>
      fetchAllOwnedObjects(
        suiClient,
        ownerAddress as string,
        `${originalPackageId}::proposal::VoteProofNFT`
      ),
    enabled: !!ownerAddress,
    gcTime: 0,
  });
};
