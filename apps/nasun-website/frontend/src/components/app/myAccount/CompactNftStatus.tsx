/**
 * CompactNftStatus Component
 *
 * Combined Battalion NFT + Founders WL status in a compact horizontal layout.
 * For the Bento Grid dashboard.
 */

import { FC, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useBattalionNftStatus } from "../../../hooks/useBattalionNftStatus";
import { checkWhitelistStatus } from "../../../services/whitelistApi";
import { DashboardCard } from "../../ui/DashboardCard";
import { Button } from "../../ui/button";

interface CompactNftStatusProps {
  walletAddress: string | null | undefined;
  className?: string;
}

interface NftStatusItemProps {
  title: string;
  isRegistered: boolean;
  isLoading: boolean;
  onAction?: () => void;
  actionLabel?: string;
}

const NftStatusItem: FC<NftStatusItemProps> = ({
  title,
  isRegistered,
  isLoading,
  onAction,
  actionLabel,
}) => (
  <div className="flex items-center justify-between p-3 bg-nasun-c6/30 rounded-lg">
    <div className="flex items-center gap-3">
      <h6 className="font-medium text-nasun-white">{title}</h6>
      {isLoading ? (
        <div className="animate-spin rounded-full h-4 w-4 border border-nasun-c3 border-t-transparent" />
      ) : isRegistered ? (
        <span className="text-green-400">✓ Registered</span>
      ) : (
        <span className="text-nasun-white/50">Not Registered</span>
      )}
    </div>
    {!isLoading && !isRegistered && onAction && actionLabel && (
      <Button onClick={onAction} variant="c4" size="sm">
        {actionLabel}
      </Button>
    )}
  </div>
);

export const CompactNftStatus: FC<CompactNftStatusProps> = ({
  walletAddress,
  className = "",
}) => {
  const { t } = useTranslation(["myAccount", "common"]);
  const navigate = useNavigate();

  // Battalion NFT Status
  const {
    isRegistered: isBattalionRegistered,
    isLoading: isBattalionLoading,
  } = useBattalionNftStatus(walletAddress);

  // Founders WL Status
  const [isFoundersRegistered, setIsFoundersRegistered] = useState(false);
  const [isFoundersLoading, setIsFoundersLoading] = useState(true);

  useEffect(() => {
    if (!walletAddress) {
      setIsFoundersLoading(false);
      return;
    }

    const fetchFoundersStatus = async () => {
      try {
        setIsFoundersLoading(true);
        const response = await checkWhitelistStatus(walletAddress);
        setIsFoundersRegistered(response.data.registered);
      } catch {
        setIsFoundersRegistered(false);
      } finally {
        setIsFoundersLoading(false);
      }
    };

    fetchFoundersStatus();
  }, [walletAddress]);

  if (!walletAddress) {
    return (
      <DashboardCard className={className}>
        <h5 className="uppercase text-nasun-white mb-4">NFT STATUS</h5>
        <p className="text-nasun-white/50">
          Connect MetaMask above to view NFT status
        </p>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard className={className}>
      <h5 className="uppercase text-nasun-white mb-4">NFT STATUS</h5>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <NftStatusItem
          title="Battalion NFT"
          isRegistered={isBattalionRegistered}
          isLoading={isBattalionLoading}
          onAction={() => navigate("/wave1/battalion-nft")}
          actionLabel="Register"
        />
        <NftStatusItem
          title="Founders Whitelist"
          isRegistered={isFoundersRegistered}
          isLoading={isFoundersLoading}
          onAction={() => navigate("/founders")}
          actionLabel="Join"
        />
      </div>
    </DashboardCard>
  );
};

export default CompactNftStatus;
