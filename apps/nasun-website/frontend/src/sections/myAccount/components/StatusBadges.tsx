import { FC } from "react";
import { Check, Link2, Circle, AlertCircle } from "lucide-react";

export const ActiveBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-nasun-c4/10 text-nasun-c4 text-[10px] font-medium border border-nasun-c4/20"
    aria-label="Wallet is currently active"
  >
    <Check className="w-3 h-3" />
    Active
  </span>
);

export const LoggedInBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-nasun-c4/10 text-nasun-c4 text-[10px] font-medium border border-nasun-c4/20"
    aria-label="Currently logged in with this account"
  >
    <Check className="w-3 h-3" />
    Logged in
  </span>
);

export const LinkedBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 text-[10px] font-medium"
    aria-label="Account is linked"
  >
    <Link2 className="w-3 h-3" />
    Linked
  </span>
);

export const ConnectedBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-nasun-c4/10 text-nasun-c4 text-[10px] font-medium border border-nasun-c4/20"
    aria-label="Wallet is connected"
  >
    <Check className="w-3 h-3" />
    Connected
  </span>
);

export const InactiveBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full"
    aria-label="Wallet is inactive"
  >
    <Circle className="w-3 h-3" />
    Inactive
  </span>
);

export const DifferentWalletBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 text-[10px] text-yellow-500 font-medium bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20"
    aria-label="A different wallet is currently active"
  >
    <AlertCircle className="w-3 h-3" />
    Different wallet active
  </span>
);
