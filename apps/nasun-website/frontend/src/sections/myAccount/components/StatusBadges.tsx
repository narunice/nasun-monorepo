import { FC } from "react";

export const ActiveBadge: FC = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-nasun-c4/10 text-nasun-c4 text-[10px] font-medium border border-nasun-c4/20">
    <span className="w-1.5 h-1.5 rounded-full bg-nasun-c4 animate-pulse" />
    Active
  </span>
);

export const LoggedInBadge: FC = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-nasun-c4/10 text-nasun-c4 text-[10px] font-medium border border-nasun-c4/20">
    <span className="w-1.5 h-1.5 rounded-full bg-nasun-c4" />
    Logged in
  </span>
);

export const LinkedBadge: FC = () => (
  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 text-[10px] font-medium">
    Linked
  </span>
);

export const ConnectedBadge: FC = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-nasun-c4/10 text-nasun-c4 text-[10px] font-medium border border-nasun-c4/20">
    <span className="w-1.5 h-1.5 rounded-full bg-nasun-c4" />
    Connected
  </span>
);

export const InactiveBadge: FC = () => (
  <span className="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full">
    Inactive
  </span>
);

export const DifferentWalletBadge: FC = () => (
  <span className="text-[10px] text-yellow-500 font-medium bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20">
    Different wallet active
  </span>
);
