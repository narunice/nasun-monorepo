import React from "react";
import { NFTTiers } from "../../../types/foundersNFTs.d";
import { getTierDisplayName } from "../../../utils/nftUtils";

interface TierBadgeProps {
  tier: NFTTiers;
  className?: string;
}

function TierBadgeComponent({ tier, className }: TierBadgeProps) {
  return (
    <span
      className={`px-2 py-1 bg-nasun-black/80 text-nasun-white ${className}`}
    >
      {getTierDisplayName(tier)}
    </span>
  );
}

export const TierBadge = React.memo(TierBadgeComponent);
