import { useSuiClientQuery } from "@mysten/dapp-kit";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { useWallet, useZkLogin } from "@nasun/wallet";

/**
 * Query MultiChoiceVoteProofNFT objects owned by the current wallet.
 * Uses multiChoicePackageId (the package where multi_choice_proposal module was first introduced).
 * In Sui, struct types always reference the package where they were first defined,
 * regardless of subsequent upgrades.
 */
export const useMultiChoiceVoteNfts = () => {
  const { account } = useWallet();
  const { state: zkLoginState } = useZkLogin();
  const multiChoicePackageId = useNetworkVariable("multiChoicePackageId");

  const ownerAddress = account?.address || zkLoginState?.address;

  return useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: ownerAddress as string,
      options: { showContent: true },
      filter: {
        StructType: `${multiChoicePackageId}::multi_choice_proposal::MultiChoiceVoteProofNFT`,
      },
    },
    {
      enabled: !!ownerAddress,
      gcTime: 0,
    }
  );
};
