import { FC } from "react";
import { Check, Link2, Bookmark } from "lucide-react";

export const UjuLoggedInBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-pado-2/10 text-pado-2 text-sm font-bold uppercase tracking-wider border border-pado-2/20"
  >
    <Check className="w-3 h-3 flex-shrink-0" />
    <span className="hidden sm:inline">Logged in</span>
  </span>
);

export const UjuLinkedBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-uju-bg border border-uju-border/30 text-uju-secondary text-sm font-bold uppercase tracking-wider"
  >
    <Link2 className="w-3 h-3 flex-shrink-0" />
    <span className="hidden sm:inline">Linked</span>
  </span>
);

export const UjuConnectedBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-pado-4/10 text-pado-4 text-sm font-bold uppercase tracking-wider border border-pado-4/20"
  >
    <Check className="w-3 h-3 flex-shrink-0" />
    <span className="hidden sm:inline">Connected</span>
  </span>
);

export const UjuRegisteredBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-300 text-sm font-bold uppercase tracking-wider border border-blue-400/20"
  >
    <Bookmark className="w-3 h-3 flex-shrink-0" />
    <span className="hidden sm:inline">Registered</span>
  </span>
);

export const UjuChannelMemberBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-pado-2/10 text-pado-2 text-sm font-bold uppercase tracking-wider border border-pado-2/20"
  >
    <Check className="w-3 h-3 flex-shrink-0" />
    <span className="hidden sm:inline">Channel Member</span>
  </span>
);
