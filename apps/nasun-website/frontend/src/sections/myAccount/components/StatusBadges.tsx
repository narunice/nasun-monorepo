import { FC, useMemo } from "react";
import { Check, Link2, Bookmark, Gift, ShieldCheck, Users, Crown } from "lucide-react";
import { useAuth } from "@/features/auth";
import { useMultiChainNFTs } from "@/features/wallet";
import { useEnabledNftCollections } from "@/features/admin/hooks/useNftCollections";

export const LoggedInBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-nasun-c4/10 text-nasun-c4 text-[10px] font-medium border border-nasun-c4/20"
    aria-label="Currently logged in with this account"
  >
    <Check className="w-3 h-3 flex-shrink-0" />
    <span className="hidden sm:inline">Logged in</span>
  </span>
);

export const LinkedBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 text-[10px] font-medium"
    aria-label="Account is linked"
  >
    <Link2 className="w-3 h-3 flex-shrink-0" />
    <span className="hidden sm:inline">Linked</span>
  </span>
);

export const ConnectedBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-nasun-c4/10 text-nasun-c4 text-[10px] font-medium border border-nasun-c4/20"
    aria-label="Wallet is connected"
  >
    <Check className="w-3 h-3 flex-shrink-0" />
    <span className="hidden sm:inline">Connected</span>
  </span>
);

export const RegisteredBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-medium border border-indigo-400/20"
    aria-label="Wallet is registered"
  >
    <Bookmark className="w-3 h-3 flex-shrink-0" />
    <span className="hidden sm:inline">Registered</span>
  </span>
);

export const ChannelMemberBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 text-[10px] font-medium border border-sky-400/20"
    aria-label="Telegram channel member"
  >
    <Check className="w-3 h-3 flex-shrink-0" />
    <span className="hidden sm:inline">Channel Member</span>
  </span>
);

export const GuaranteedBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-400/20"
    aria-label="Guaranteed allowlist spot"
  >
    <ShieldCheck className="w-3 h-3 flex-shrink-0" />
    <span>GTD</span>
  </span>
);

export const FcfsBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 text-[10px] font-medium border border-violet-400/20"
    aria-label="First come first serve allowlist"
  >
    <Users className="w-3 h-3 flex-shrink-0" />
    <span>FCFS</span>
  </span>
);

export const FreeMintBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-medium border border-amber-400/20"
    aria-label="Free mint raffle winner"
  >
    <Gift className="w-3 h-3 flex-shrink-0" />
    <span>Free Mint</span>
  </span>
);

/**
 * GenesisPassBadge - Self-contained badge that fetches NFT ownership internally.
 * Unlike other badges in this file (stateless, zero-prop), this component calls hooks
 * to check if the user holds a featured NFT collection. This isolates the data dependency
 * from ProfileHeroCard (996+ lines), preventing unnecessary re-renders.
 * React Query cache deduplicates with AssetsCard's identical useMultiChainNFTs call.
 */
export const GenesisPassBadge: FC = () => {
  const { user } = useAuth();
  const walletAddress =
    user?.linkedAccounts?.metamask?.walletAddress
    || (user?.provider === "MetaMask" ? user.walletAddress : undefined);

  const { data: nfts } = useMultiChainNFTs(walletAddress);
  const { data: collections } = useEnabledNftCollections();

  const isHolder = useMemo(() => {
    if (!walletAddress || !nfts || !collections) return false;
    const featuredContracts = new Set(
      collections.filter((c) => c.featured).map((c) => `${c.contractAddress}:${c.chain}`)
    );
    return nfts.some((nft) => {
      const chain = nft.chain ?? "ethereum";
      return featuredContracts.has(`${nft.contractAddress.toLowerCase()}:${chain}`);
    });
  }, [walletAddress, nfts, collections]);

  if (!isHolder) return null;

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full
                 bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-500/15
                 text-amber-300 text-[10px] font-semibold tracking-wide
                 border border-amber-400/25
                 shadow-[0_0_6px_rgba(249,168,36,0.12)]"
      aria-label="Genesis Pass NFT holder"
    >
      <Crown className="w-3 h-3 flex-shrink-0" />
      <span className="hidden sm:inline">Genesis Pass</span>
      <span className="sm:hidden">Genesis</span>
    </span>
  );
};
