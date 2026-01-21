/**
 * AssetsCard Component
 *
 * Wraps MyAssets (OwnedObjects) in an OuterBox for the Bento Grid layout.
 * Displays Ethereum NFTs and Nasun (Sui) objects.
 */

import { FC } from "react";
import { OuterBox } from "@/components/ui";
import { OwnedObjects } from "./OwnedObjects";

interface AssetsCardProps {
  walletAddress?: string;
  className?: string;
}

export const AssetsCard: FC<AssetsCardProps> = ({
  walletAddress,
  className = "",
}) => {
  return (
    <OuterBox color="c5" padding="sm" className={className}>
      <h5 className="uppercase text-nasun-white mb-4">MY ASSETS</h5>
      <OwnedObjects walletAddress={walletAddress} />
    </OuterBox>
  );
};

export default AssetsCard;
