/**
 * CompactNftStatus Component
 *
 * Combined Battalion NFT + Founders WL status in a compact horizontal layout.
 * For the Bento Grid dashboard.
 */

import { FC, useState, useEffect, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useBattalionNftStatus } from "../../../hooks/useBattalionNftStatus";
import { checkWhitelistStatus, withdrawWhitelist } from "../../../services/whitelistApi";
import { withdrawUserApi } from "../../../services/battalionNftApi";
import { useBattalionNftStore } from "../../../stores/useBattalionNftStore";
import { DashboardCard } from "../../ui/DashboardCard";
import { Button } from "../../ui/button";
import { JoinWhitelistButton } from "../../whitelist/JoinWhitelistButton";

interface CompactNftStatusProps {
  walletAddress: string | null | undefined;
  className?: string;
}

interface NftStatusItemProps {
  title: string;
  isRegistered: boolean;
  isLoading: boolean;
  onJoin?: () => void;
  onWithdraw?: () => void;
  /** Custom join button to render instead of default */
  renderJoinButton?: ReactNode;
}

const NftStatusItem: FC<NftStatusItemProps> = ({
  title,
  isRegistered,
  isLoading,
  onJoin,
  onWithdraw,
  renderJoinButton,
}) => (
  <div className="flex items-center justify-between p-4 bg-gray-800/80 rounded-lg">
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
    {!isLoading && (
      isRegistered ? (
        onWithdraw && (
          <Button onClick={onWithdraw} variant="filledOutlineScarlet" size="sm">
            Withdraw
          </Button>
        )
      ) : (
        renderJoinButton || (
          onJoin && (
            <Button onClick={onJoin} variant="filledOutlineC4" size="sm">
              Join
            </Button>
          )
        )
      )
    )}
  </div>
);

export const CompactNftStatus: FC<CompactNftStatusProps> = ({
  walletAddress,
  className = "",
}) => {
  const navigate = useNavigate();
  const { reset: resetBattalionStore } = useBattalionNftStore();
  const [isBattalionWithdrawing, setIsBattalionWithdrawing] = useState(false);
  const [isGenesisWithdrawing, setIsGenesisWithdrawing] = useState(false);

  // Battalion NFT Status
  const {
    isRegistered: isBattalionRegistered,
    isLoading: isBattalionLoading,
    refetch: refetchBattalion,
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

  // Refetch Founders status
  const refetchFounders = async () => {
    if (!walletAddress) return;
    try {
      const response = await checkWhitelistStatus(walletAddress);
      setIsFoundersRegistered(response.data.registered);
    } catch {
      setIsFoundersRegistered(false);
    }
  };

  /**
   * Battalion NFT Withdraw Handler (no signature required)
   */
  const handleBattalionWithdraw = async () => {
    if (!walletAddress || isBattalionWithdrawing) return;

    if (!confirm("Are you sure you want to withdraw from Battalion NFT Allowlist?")) {
      return;
    }

    try {
      setIsBattalionWithdrawing(true);
      await withdrawUserApi({
        walletAddress: walletAddress.toLowerCase(),
        signature: "",
        message: "",
        timestamp: new Date().toISOString(),
      });
      resetBattalionStore();
      refetchBattalion();
      alert("Successfully withdrawn from Battalion NFT Allowlist.");
    } catch (err) {
      console.error("[CompactNftStatus] Battalion withdraw error:", err);
      alert("Failed to withdraw. Please try again.");
    } finally {
      setIsBattalionWithdrawing(false);
    }
  };

  /**
   * Genesis NFT Withdraw Handler (no signature required)
   */
  const handleGenesisWithdraw = async () => {
    if (!walletAddress || isGenesisWithdrawing) return;

    if (!confirm("Are you sure you want to withdraw from Genesis NFT Whitelist?")) {
      return;
    }

    try {
      setIsGenesisWithdrawing(true);
      await withdrawWhitelist(
        walletAddress.toLowerCase(),
        "",
        "",
        new Date().toISOString()
      );
      refetchFounders();
      alert("Successfully withdrawn from Genesis NFT Whitelist.");
    } catch (err) {
      console.error("[CompactNftStatus] Founders withdraw error:", err);
      alert("Failed to withdraw. Please try again.");
    } finally {
      setIsGenesisWithdrawing(false);
    }
  };

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
      <div className="flex flex-col gap-3">
        <NftStatusItem
          title="Battalion NFT Allowlist"
          isRegistered={isBattalionRegistered}
          isLoading={isBattalionLoading || isBattalionWithdrawing}
          onJoin={() => navigate("/wave1/battalion-nft")}
          onWithdraw={handleBattalionWithdraw}
        />
        <NftStatusItem
          title="Genesis NFT Whitelist"
          isRegistered={isFoundersRegistered}
          isLoading={isFoundersLoading || isGenesisWithdrawing}
          onWithdraw={handleGenesisWithdraw}
          renderJoinButton={
            <JoinWhitelistButton
              variant="filledOutlineC4"
              size="sm"
              onSuccess={() => refetchFounders()}
            >
              Join
            </JoinWhitelistButton>
          }
        />
      </div>
    </DashboardCard>
  );
};

export default CompactNftStatus;
