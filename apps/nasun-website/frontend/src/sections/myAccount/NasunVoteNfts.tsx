import { FC, useMemo } from "react";
import { useSuiClientQueries } from "@mysten/dapp-kit";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { useUserStore } from "@/store/userStore";
import { NftImageModal } from "@/features/governance/components/NftImageModal";
import { Spinner } from "@/components/ui";

interface VoteNftItem {
  id: string;
  url: string;
  proposalId: string;
  votingPower?: number;
}

function extractNfts(
  data: { data?: { content?: { dataType: string; fields: Record<string, unknown> }; objectId?: string } }[] | undefined,
): VoteNftItem[] {
  if (!data) return [];
  return data
    .map((obj) => {
      if (obj.data?.content?.dataType !== "moveObject") return null;
      const fields = obj.data.content.fields as {
        proposal_id?: string;
        url?: string;
        voting_power?: string | number;
        id?: { id: string };
      };
      if (!fields.url || !fields.proposal_id || !obj.data.objectId) return null;
      if (!fields.url.startsWith("https://") && !fields.url.startsWith("http://")) return null;
      return {
        id: obj.data.objectId,
        url: fields.url,
        proposalId: fields.proposal_id,
        votingPower: fields.voting_power ? Number(fields.voting_power) : undefined,
      };
    })
    .filter((item): item is VoteNftItem => item !== null);
}

function isSuiAddress(addr: string): boolean {
  return addr.startsWith("0x") && addr.length === 66;
}

/**
 * Collects all known Nasun (Sui) wallet addresses from multiple sources.
 * Works even when the wallet is locked, since user profile stores the address.
 */
function useNasunAddresses(): string[] {
  const { account } = useWallet();
  const { state: zkLoginState } = useZkLogin();
  const user = useUserStore((s) => s.user);

  return useMemo(() => {
    const addrs = new Set<string>();
    // Active wallet (available when unlocked)
    if (account?.address) addrs.add(account.address);
    // zkLogin wallet
    if (zkLoginState?.address) addrs.add(zkLoginState.address);
    // Linked Nasun wallet from user profile (always available after login)
    const linked = user?.linkedAccounts?.["nasun wallet"]?.walletAddress;
    if (linked && isSuiAddress(linked)) addrs.add(linked);
    // Primary login wallet address (filter out EVM addresses)
    if (user?.walletAddress && isSuiAddress(user.walletAddress)) addrs.add(user.walletAddress);
    return Array.from(addrs);
  }, [account?.address, zkLoginState?.address, user?.linkedAccounts, user?.walletAddress]);
}

export const NasunVoteNfts: FC = () => {
  const addresses = useNasunAddresses();
  const originalPackageId = useNetworkVariable("originalPackageId");
  const multiChoicePackageId = useNetworkVariable("multiChoicePackageId");

  // Build queries: for each address, query both VoteProofNFT and MultiChoiceVoteProofNFT
  const queries = useMemo(() => {
    if (addresses.length === 0) return [];
    return addresses.flatMap((addr) => [
      {
        method: "getOwnedObjects" as const,
        params: {
          owner: addr,
          options: { showContent: true },
          filter: { StructType: `${originalPackageId}::proposal::VoteProofNFT` },
        },
      },
      {
        method: "getOwnedObjects" as const,
        params: {
          owner: addr,
          options: { showContent: true },
          filter: { StructType: `${multiChoicePackageId}::multi_choice_proposal::MultiChoiceVoteProofNFT` },
        },
      },
    ]);
  }, [addresses, originalPackageId, multiChoicePackageId]);

  const results = useSuiClientQueries({
    queries,
    combine: (res) => ({
      data: res.map((r) => r.data),
      isLoading: res.some((r) => r.isLoading),
    }),
  });

  if (addresses.length === 0) return null;

  if (results.isLoading) {
    return (
      <div className="py-4 flex justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  // Deduplicate NFTs by object ID (in case same wallet appears from multiple sources)
  const seen = new Set<string>();
  const nfts: VoteNftItem[] = [];
  for (const result of results.data) {
    for (const nft of extractNfts(result?.data)) {
      if (!seen.has(nft.id)) {
        seen.add(nft.id);
        nfts.push(nft);
      }
    }
  }

  if (nfts.length === 0) return null;

  return (
    <div className="mb-6">
      <h6 className="font-semibold mb-3 text-gray-200">
        Vote Proof NFTs ({nfts.length})
      </h6>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {nfts.map((nft) => (
          <div
            key={nft.id}
            className="group relative rounded-lg overflow-hidden border border-nasun-white/10 bg-nasun-white/[0.03] hover:border-nasun-nw1/30 transition-colors"
          >
            <div className="aspect-square">
              <NftImageModal
                src={nft.url}
                alt="Vote Proof NFT"
                thumbnailClassName="w-full h-full object-cover"
              />
            </div>
            <div className="p-2">
              <p className="text-[10px] text-nasun-white/40 uppercase tracking-wider">
                Vote Proof
              </p>
              <p className="text-xs text-nasun-white/60 font-mono truncate" title={nft.proposalId}>
                {nft.proposalId.slice(0, 6)}...{nft.proposalId.slice(-4)}
              </p>
              {nft.votingPower != null && (
                <p className="text-[10px] text-nasun-nw4/70 mt-0.5">
                  {nft.votingPower} VP
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
