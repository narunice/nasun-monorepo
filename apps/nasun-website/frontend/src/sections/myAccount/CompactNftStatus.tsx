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
import { authenticateWithMetaMask } from "../../services/metamaskApi";
import { connectWallet, signMessage } from "../../utils/metamaskUtils";
import { connectMetaMaskSDK, signMessageViaSDK } from "../../lib/wallet/metamaskSdkProvider";
import { isMobileBrowser } from "../../utils/mobileDetect";
import { OuterBox, Spinner } from "@/components/ui";
import { Button } from "@/components/ui/button";

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
   * Authenticates with MetaMask to get HMAC wallet proof before withdrawing.
   */
  const handleBattalionWithdraw = async () => {
    const registeredWallet = battalionStatus?.walletAddress;
    if (!registeredWallet || isBattalionWithdrawing) return;

    if (!confirm("Are you sure you want to withdraw from Battalion NFT Allowlist?")) {
      return;
    }

    try {
      setIsBattalionWithdrawing(true);

      // Authenticate with MetaMask to get wallet proof
      // Mobile: use MetaMask SDK (Socket.io relay), Desktop: use injected provider
      const mobile = isMobileBrowser();
      const connectedAddress = mobile ? await connectMetaMaskSDK() : await connectWallet();
      if (connectedAddress.toLowerCase() !== registeredWallet.toLowerCase()) {
        toast.error(`Please connect the registered wallet (${registeredWallet.slice(0, 6)}...${registeredWallet.slice(-4)}).`);
        return;
      }

      const authResult = await authenticateWithMetaMask(connectedAddress, async (message) => {
        return mobile ? await signMessageViaSDK(message, connectedAddress) : await signMessage(message, connectedAddress);
      });

      if (!authResult.walletProof || !authResult.proofIssuedAt) {
        throw new Error("Failed to get wallet proof");
      }

      await withdrawUserApi({
        walletAddress: registeredWallet.toLowerCase(),
        walletProof: authResult.walletProof,
        proofIssuedAt: authResult.proofIssuedAt,
      });
      resetBattalionStore();
      refetchBattalion();
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
    <OuterBox color="c5" padding="sm" className={`animate-fade-slide-up ${className}`}>
      <h5 className="font-medium uppercase text-nasun-white mb-4">NFT STATUS</h5>
      <div className="flex flex-col gap-3">
        <NftStatusItem
          title="Battalion NFT Allowlist"
          isRegistered={isBattalionRegistered}
          isLoading={isBattalionLoading || isBattalionWithdrawing}
          onJoin={() => navigate("/wave1/battalion-nft")}
          onWithdraw={handleBattalionWithdraw}
        />
      </div>
    </OuterBox>
  );
};

export default CompactNftStatus;
