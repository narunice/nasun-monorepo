import { FC, useMemo } from "react";
import { useSuiClientQueries } from "@mysten/dapp-kit";
import { ExternalLink } from "lucide-react";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { useUserStore } from "@/store/userStore";
import { NftImageModal } from "@/features/governance/components/NftImageModal";
import { Spinner } from "@/components/ui";
import { useWalletRegistration } from "./hooks/useWalletRegistration";

// Pinata gateway CID -> local image path mapping for already-minted Vote Proof NFTs
const IPFS_LOCAL_MAP: Record<string, string> = {
  bafkreidvwd65472yxlhr4vhoqxqugccpy6xgsat2mdb6vjznltodkxw4tu: "/images/nft/vote-proof-default.webp",
  bafybeidqzi47x2iue4cyjsn6lduh33ca5y362s4k3dk3eh7ornsa4wzhea: "/images/nft/vote-proof-yes.jpg",
  bafybeih5vmxazgn7jkyzt3ssi4kbia2pteaq7r6a6svhtmr37oh3c36iui: "/images/nft/vote-proof-no.jpg",
};

function resolveNftImageUrl(url: string): string {
  for (const [cid, localPath] of Object.entries(IPFS_LOCAL_MAP)) {
    if (url.includes(cid)) return localPath;
  }
  return url;
}

interface VoteNftItem {
  id: string;
  url: string;
  proposalId: string;
  name: string;
  owner: string;
}

type ExtractedNft = Omit<VoteNftItem, "owner">;

function extractNfts(
  data: { data?: { content?: { dataType: string; fields: Record<string, unknown> }; objectId?: string } }[] | undefined,
): ExtractedNft[] {
  if (!data) return [];
  return data
    .map((obj) => {
      if (obj.data?.content?.dataType !== "moveObject") return null;
      const fields = obj.data.content.fields as {
        proposal_id?: string;
        url?: string;
        name?: string;
        id?: { id: string };
      };
      if (!fields.url || !fields.proposal_id || !obj.data.objectId) return null;
      if (!fields.url.startsWith("https://") && !fields.url.startsWith("http://")) return null;
      return {
        id: obj.data.objectId,
        url: fields.url,
        proposalId: fields.proposal_id,
        name: (fields.name as string) || "",
      };
    })
    .filter((item): item is ExtractedNft => item !== null);
}

function isSuiAddress(addr: string): boolean {
  return addr.startsWith("0x") && addr.length === 66;
}

/**
 * Collects all known Nasun (Sui) wallet addresses from multiple sources,
 * including registered wallets from the backend.
 * Works even when the wallet is locked, since user profile stores the address.
 */
function useNasunAddresses(): string[] {
  const { account } = useWallet();
  const { state: zkLoginState } = useZkLogin();
  const user = useUserStore((s) => s.user);
  const linkedWallet = user?.linkedAccounts?.["nasun wallet"]?.walletAddress;
  const { registeredWallets } = useWalletRegistration();

  return useMemo(() => {
    const addrs = new Set<string>();
    // Active wallet (available when unlocked)
    if (account?.address) addrs.add(account.address);
    // zkLogin wallet
    if (zkLoginState?.address) addrs.add(zkLoginState.address);
    // Linked Nasun wallet from user profile (always available after login)
    if (linkedWallet && isSuiAddress(linkedWallet)) addrs.add(linkedWallet);
    // Primary login wallet address (filter out EVM addresses)
    if (user?.walletAddress && isSuiAddress(user.walletAddress)) addrs.add(user.walletAddress);
    // All registered wallets from backend
    for (const w of registeredWallets) {
      if (isSuiAddress(w.walletAddress)) addrs.add(w.walletAddress);
    }
    return Array.from(addrs);
  }, [account?.address, zkLoginState?.address, linkedWallet, user?.walletAddress, registeredWallets]);
}

export const NasunVoteNfts: FC<{ children?: React.ReactNode }> = ({ children }) => {
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
  results.data.forEach((result, idx) => {
    const owner = addresses[Math.floor(idx / 2)];
    for (const nft of extractNfts(result?.data)) {
      if (!seen.has(nft.id)) {
        seen.add(nft.id);
        nfts.push({ ...nft, owner });
      }
    }
  });

  const explorerUrl =
    import.meta.env.VITE_DEVNET_EXPLORER_URL || "https://explorer.nasun.io/devnet";

  if (nfts.length === 0 && !children) return null;

  return (
    <div className="mb-6">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {children}
        {nfts.map((nft) => (
          <div
            key={nft.id}
            className="group relative rounded-lg overflow-hidden border border-nasun-white/10 bg-nasun-white/[0.03] hover:border-nasun-nw1/30 transition-colors"
          >
            <div className="aspect-square">
              <NftImageModal
                src={resolveNftImageUrl(nft.url)}
                alt="Vote Proof NFT"
                thumbnailClassName="w-full h-full object-cover"
              >
                <div className="space-y-1 text-nasun-white/70">
                  <p><span className="text-nasun-white/40">Proposal:</span> {nft.name.startsWith("NFT ") ? nft.name.slice(4) : nft.name}</p>
                  <p className="font-mono text-sm">
                    <span className="text-nasun-white/40">Proposal ID:</span> {nft.proposalId.slice(0, 10)}...{nft.proposalId.slice(-6)}
                    <a href={`${explorerUrl}/object/${nft.proposalId}`} target="_blank" rel="noopener noreferrer" className="inline-flex align-middle ml-1 text-nasun-white/40 hover:text-nasun-nw1 transition-colors">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                  <p className="font-mono text-sm">
                    <span className="text-nasun-white/40">Object ID:</span> {nft.id.slice(0, 10)}...{nft.id.slice(-6)}
                    <a href={`${explorerUrl}/object/${nft.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex align-middle ml-1 text-nasun-white/40 hover:text-nasun-nw1 transition-colors">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                  <p className="font-mono text-sm">
                    <span className="text-nasun-white/40">Wallet:</span> {nft.owner.slice(0, 10)}...{nft.owner.slice(-6)}
                    <a href={`${explorerUrl}/address/${nft.owner}`} target="_blank" rel="noopener noreferrer" className="inline-flex align-middle ml-1 text-nasun-white/40 hover:text-nasun-nw1 transition-colors">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                </div>
              </NftImageModal>
            </div>
            <div className="p-2">
              <p className="text-sm text-nasun-white/40 uppercase tracking-wider">
                Vote Proof
              </p>
              <p className="text-sm text-nasun-white/60 font-mono truncate" title={nft.id}>
                {nft.id.slice(0, 6)}...{nft.id.slice(-4)}
              </p>
              {nft.name && (
                <p className="text-sm text-nasun-white/50 truncate mt-0.5"
                   title={nft.name.startsWith("NFT ") ? nft.name.slice(4) : nft.name}>
                  {nft.name.startsWith("NFT ") ? nft.name.slice(4) : nft.name}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
