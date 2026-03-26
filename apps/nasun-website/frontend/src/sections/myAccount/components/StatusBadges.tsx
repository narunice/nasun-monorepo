import { FC } from "react";
import { Check, Link2, Bookmark, Gift, ShieldCheck } from "lucide-react";

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
    <span className="hidden sm:inline">GTD</span>
  </span>
);

export const FreeMintBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-medium border border-amber-400/20"
    aria-label="Free mint raffle winner"
  >
    <Gift className="w-3 h-3 flex-shrink-0" />
    <span className="hidden sm:inline">Free Mint</span>
  </span>
);
