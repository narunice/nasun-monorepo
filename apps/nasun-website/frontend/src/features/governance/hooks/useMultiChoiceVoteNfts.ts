import { useSuiClient } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { fetchAllOwnedObjects } from "../utils/ownedObjects";

const MULTI_CHOICE_VOTE_NFTS_QUERY_KEY =
  "governance-multi-choice-vote-nfts";

/**
 * Query MultiChoiceVoteProofNFT objects owned by the current wallet.
 * Uses multiChoicePackageId (the package where multi_choice_proposal module was first introduced).
 * In Sui, struct types always reference the package where they were first defined,
 * regardless of subsequent upgrades.
 */
export const useMultiChoiceVoteNfts = () => {
  const suiClient = useSuiClient();
  const { account } = useWallet();
  const { state: zkLoginState } = useZkLogin();
  const multiChoicePackageId = useNetworkVariable("multiChoicePackageId");

  const ownerAddress = account?.address || zkLoginState?.address;

  return useQuery({
    queryKey: [
      MULTI_CHOICE_VOTE_NFTS_QUERY_KEY,
      ownerAddress,
      multiChoicePackageId,
    ],
    queryFn: () =>
      fetchAllOwnedObjects(
        suiClient,
        ownerAddress as string,
        `${multiChoicePackageId}::multi_choice_proposal::MultiChoiceVoteProofNFT`
      ),
    enabled: !!ownerAddress,
    gcTime: 0,
  });
};
