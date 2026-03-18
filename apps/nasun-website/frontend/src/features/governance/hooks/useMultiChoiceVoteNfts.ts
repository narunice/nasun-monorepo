import { useSuiClientQuery } from "@mysten/dapp-kit";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { useWallet, useZkLogin } from "@nasun/wallet";

/**
 * Query MultiChoiceVoteProofNFT objects owned by the current wallet.
 * Uses packageId (not originalPackageId) because the multi_choice_proposal module
 * and MultiChoiceVoteProofNFT struct were added in later upgrades, not in the original package.
 * The struct type references the package where it was first defined.
 */
export const useMultiChoiceVoteNfts = () => {
  const { account } = useWallet();
  const { state: zkLoginState } = useZkLogin();
  const packageId = useNetworkVariable("packageId");

  const ownerAddress = account?.address || zkLoginState?.address;

  return useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: ownerAddress as string,
      options: { showContent: true },
      filter: {
        StructType: `${packageId}::multi_choice_proposal::MultiChoiceVoteProofNFT`,
      },
    },
    {
      enabled: !!ownerAddress,
      gcTime: 0,
    }
  );
};
