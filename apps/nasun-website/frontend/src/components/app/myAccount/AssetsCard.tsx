/**
 * AssetsCard Component
 *
 * Wraps MyAssets (OwnedObjects) in a DashboardCard for the Bento Grid layout.
 * Displays Ethereum NFTs and Nasun (Sui) objects.
 */

import { FC } from "react";
import { DashboardCard } from "../../ui/DashboardCard";
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
    <DashboardCard className={className}>
      <h5 className="uppercase text-nasun-white mb-4">MY ASSETS</h5>
      <OwnedObjects walletAddress={walletAddress} />
    </DashboardCard>
  );
};

export default AssetsCard;
