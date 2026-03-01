/**
 * CompactNftStatus Component
 *
 * Battalion NFT Allowlist status in a compact layout.
 * For the Bento Grid dashboard.
 *
 * NOTE: Frontiers Whitelist is hidden during Battalion NFT campaign.
 * It will be re-added when Frontiers NFT campaign starts (post-Battalion sales).
 */

import { FC, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuth } from "@/features/auth";
import { useBattalionNftStatus } from "../../hooks/useBattalionNftStatus";
import { withdrawUserApi } from "../../services/battalionNftApi";
import { useBattalionNftStore } from "../../stores/useBattalionNftStore";
import { OuterBox, Spinner } from "@/components/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
  <div className="flex flex-col gap-2 p-4 bg-gray-800/80 rounded-sm">
    <h6 className="text-nasun-white ">{title}</h6>
    <div className="flex items-center justify-between">
      {isLoading ? (
        <Spinner size="sm" />
      ) : isRegistered ? (
        <span className="text-green-400 text-sm">✓ Registered</span>
      ) : (
        <span className="text-nasun-white/50 text-sm">Not Registered</span>
      )}
      {!isLoading &&
        (isRegistered
          ? onWithdraw && (
              <Button onClick={onWithdraw} variant="filledOutlineScarlet" size="sm">
                Withdraw
              </Button>
            )
          : renderJoinButton ||
            (onJoin && (
              <Button onClick={onJoin} variant="filledOutlineC7" size="sm">
                Join
              </Button>
            )))}
    </div>
  </div>
);

export const CompactNftStatus: FC<CompactNftStatusProps> = ({ walletAddress, className = "" }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { reset: resetBattalionStore } = useBattalionNftStore();
  const [isBattalionWithdrawing, setIsBattalionWithdrawing] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);

  // Battalion NFT Status — pass twitterId for xUserId fallback lookup
  // Check both direct twitterId (Twitter login) and linkedAccounts (MetaMask login with linked Twitter)
  const twitterId = user?.twitterId ?? user?.linkedAccounts?.twitter?.twitterId;
  // Final fallback: use Battalion NFT store's xUserId if registration completed.
  // Covers MetaMask-primary login where reverse link hasn't been established yet.
  // When registration completes, `registered` flips true → selector returns xUserId
  // → effectiveXUserId changes → useBattalionNftStatus refetches status via API.
  const battalionXUserId = useBattalionNftStore((s) => s.registered ? s.xUserId : undefined);
  const effectiveXUserId = twitterId ?? battalionXUserId;
  const {
    status: battalionStatus,
    isRegistered: isBattalionRegistered,
    isLoading: isBattalionLoading,
    refetch: refetchBattalion,
  } = useBattalionNftStatus(walletAddress, effectiveXUserId);

  /**
   * Battalion NFT Withdraw Handler
   * Uses xUserId matching instead of MetaMask signature for better mobile UX.
   */
  const handleBattalionWithdraw = async () => {
    const registeredWallet = battalionStatus?.walletAddress;
    if (!registeredWallet || !effectiveXUserId || !user?.cognitoToken || isBattalionWithdrawing) return;

    try {
      setIsBattalionWithdrawing(true);
      await withdrawUserApi({
        walletAddress: registeredWallet.toLowerCase(),
        xUserId: effectiveXUserId,
      }, user.cognitoToken);
      resetBattalionStore();
      refetchBattalion();
      setShowWithdrawDialog(false);
      toast.success("Successfully withdrawn from Battalion NFT Allowlist.");
    } catch (err) {
      console.error("[CompactNftStatus] Battalion withdraw error:", err);
      toast.error("Failed to withdraw. Please try again.");
    } finally {
      setIsBattalionWithdrawing(false);
    }
  };

  if (!walletAddress && !effectiveXUserId) {
    return (
      <OuterBox color="c5" padding="sm" className={`animate-fade-slide-up ${className}`}>
        <h5 className="font-medium uppercase text-nasun-white mb-4">NFT STATUS</h5>
        <p className="text-nasun-white/50">Connect MetaMask above to view NFT status</p>
      </OuterBox>
    );
  }

  return (
    <>
      <OuterBox color="c5" padding="sm" className={`animate-fade-slide-up ${className}`}>
        <h5 className="font-medium uppercase text-nasun-white mb-4">NFT STATUS</h5>
        <div className="flex flex-col gap-3">
          <NftStatusItem
            title="Battalion NFT Allowlist"
            isRegistered={isBattalionRegistered}
            isLoading={isBattalionLoading || isBattalionWithdrawing}
            onJoin={() => navigate("/wave1/battalion-nft")}
            onWithdraw={() => setShowWithdrawDialog(true)}
          />
        </div>
      </OuterBox>

      {/* Withdraw Confirmation Dialog */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent className="bg-gray-900 border-nasun-c5/30">
          <DialogHeader>
            <DialogTitle className="text-nasun-white">Withdraw from Allowlist</DialogTitle>
            <DialogDescription className="text-nasun-white/70">
              Are you sure you want to withdraw from the Battalion NFT Allowlist?
              You can re-register later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="filledOutlineC7"
              size="sm"
              onClick={() => setShowWithdrawDialog(false)}
              disabled={isBattalionWithdrawing}
            >
              Cancel
            </Button>
            <Button
              variant="filledOutlineScarlet"
              size="sm"
              onClick={handleBattalionWithdraw}
              disabled={isBattalionWithdrawing}
            >
              {isBattalionWithdrawing ? "Withdrawing..." : "Withdraw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CompactNftStatus;
