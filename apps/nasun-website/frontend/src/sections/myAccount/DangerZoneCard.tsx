/**
 * DangerZoneCard Component
 *
 * Account Management card: allowlist withdrawal + account deletion.
 * Full-width card at the bottom of the Bento Grid dashboard.
 */

import { FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { useAuth } from "@/features/auth";
import { useBattalionNftStatus } from "../../hooks/useBattalionNftStatus";
import { useGenesisPassStatus } from "../../hooks/useGenesisPassStatus";
import { withdrawUserApi } from "../../services/battalionNftApi";
import { withdrawGenesisPass } from "../../services/genesisPassApi";
import { useBattalionNftStore } from "../../stores/useBattalionNftStore";
import { OuterBox } from "@/components/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface DangerZoneCardProps {
  className?: string;
}

export const DangerZoneCard: FC<DangerZoneCardProps> = ({ className = "" }) => {
  const { t } = useTranslation("myAccount");
  const { user, logout } = useAuth();
  const { reset: resetBattalionStore, cognitoToken: battalionCognitoToken } = useBattalionNftStore();
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [isGenesisWithdrawing, setIsGenesisWithdrawing] = useState(false);
  const [showGenesisWithdrawDialog, setShowGenesisWithdrawDialog] = useState(false);

  // Battalion NFT Status -- lookup by X account (twitterId)
  const twitterId = user?.twitterId ?? user?.linkedAccounts?.twitter?.twitterId;
  const effectiveXUserId = twitterId;
  const {
    status: battalionStatus,
    isRegistered: isBattalionRegistered,
  } = useBattalionNftStatus(undefined, effectiveXUserId);

  // Genesis Pass Status -- lookup by EVM wallet address
  const evmWalletAddress =
    user?.linkedAccounts?.metamask?.walletAddress
    || (user?.provider === "MetaMask" ? user.walletAddress : undefined);
  const {
    isRegistered: isGenesisPassRegistered,
    isConfigured: isGenesisPassConfigured,
    refetch: refetchGenesisPass,
  } = useGenesisPassStatus(evmWalletAddress);

  const handleWithdraw = async () => {
    const registeredWallet = battalionStatus?.walletAddress;
    if (isWithdrawing) return;

    if (!registeredWallet || !effectiveXUserId) {
      toast.error("Unable to withdraw. Please try again later.");
      return;
    }

    const token = user?.cognitoToken ?? battalionCognitoToken;
    if (!token) {
      toast.error("Session expired. Please sign out and sign in again to withdraw.");
      return;
    }

    try {
      setIsWithdrawing(true);
      await withdrawUserApi(
        {
          walletAddress: registeredWallet.toLowerCase(),
          xUserId: effectiveXUserId,
        },
        token,
      );
      resetBattalionStore();
      setShowWithdrawDialog(false);
      toast.success("Successfully withdrawn from Battalion NFT Allowlist.");
    } catch (err) {
      console.error("[DangerZoneCard] Battalion withdraw error:", err);
      toast.error("Failed to withdraw. Please try again.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleGenesisPassWithdraw = async () => {
    if (isGenesisWithdrawing) return;

    const token = user?.cognitoToken;
    if (!token) {
      toast.error("Session expired. Please sign out and sign in again to withdraw.");
      return;
    }

    try {
      setIsGenesisWithdrawing(true);
      await withdrawGenesisPass(token);
      setShowGenesisWithdrawDialog(false);
      toast.success("Successfully withdrawn from Genesis Pass Allowlist.");
      refetchGenesisPass();
    } catch (err) {
      console.error("[DangerZoneCard] Genesis Pass withdraw error:", err);
      toast.error("Failed to withdraw. Please try again.");
    } finally {
      setIsGenesisWithdrawing(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmation = window.confirm(t("accountDeletion.confirm"));

    if (!confirmation) return;

    try {
      if (!user?.identityId || !user?.provider) {
        throw new Error(t("error.notAuthenticated", { ns: "common" }));
      }

      const apiUrl = `${import.meta.env.VITE_DEACTIVATE_USER_API_URL}?identityId=${encodeURIComponent(
        user.identityId,
      )}&provider=${encodeURIComponent(user.provider)}`;

      const response = await fetch(apiUrl, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: t("accountDeletion.error", { error: "Unknown error" }) }));
        throw new Error(errorData.message);
      }

      toast.success(t("accountDeletion.success"));
      await logout();
    } catch (error) {
      console.error("Error deleting account:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(t("accountDeletion.error", { error: errorMessage }));
    }
  };

  return (
    <>
      <OuterBox color="c5" padding="sm" className={`animate-fade-slide-up ${className}`}>
        <h5 className="font-medium uppercase mb-5">{t("accountManagement.title")}</h5>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Withdraw Battalion NFT Allowlist */}
          {isBattalionRegistered && (
            <div className="flex flex-col gap-3 p-4 border border-red-500/20 rounded-sm bg-red-500/[0.04]">
              <div>
                <h6 className="font-medium text-nasun-white mb-1">{t("accountManagement.withdraw.title")}</h6>
                <p className="text-nasun-white/50 text-sm">{t("accountManagement.withdraw.description")}</p>
              </div>
              <Button
                onClick={() => setShowWithdrawDialog(true)}
                variant="outlineScarlet"
                size="sm"
                className="text-red-600 self-start"
              >
                {t("accountManagement.withdraw.button")}
              </Button>
            </div>
          )}

          {/* Withdraw Genesis Pass Allowlist */}
          {isGenesisPassConfigured && isGenesisPassRegistered && (
            <div className="flex flex-col gap-3 p-4 border border-red-500/20 rounded-sm bg-red-500/[0.04]">
              <div>
                <h6 className="font-medium text-nasun-white mb-1">Withdraw Genesis Pass</h6>
                <p className="text-nasun-white/50 text-sm">
                  Remove your EVM wallet from the Genesis Pass NFT allowlist. You can re-register later.
                </p>
              </div>
              <Button
                onClick={() => setShowGenesisWithdrawDialog(true)}
                variant="outlineScarlet"
                size="sm"
                className="text-red-600 self-start"
              >
                Withdraw
              </Button>
            </div>
          )}

          {/* Delete Account */}
          <div className="flex flex-col gap-3 p-4 border border-red-500/20 rounded-sm bg-red-500/[0.04]">
            <div>
              <h6 className="font-medium text-nasun-white mb-1">{t("accountManagement.deleteAccount.title")}</h6>
              <p className="text-nasun-white/50 text-sm">{t("accountManagement.deleteAccount.description")}</p>
            </div>
            <Button
              onClick={handleDeleteAccount}
              variant="outlineScarlet"
              size="sm"
              className="text-red-600 self-start"
            >
              {t("accountManagement.deleteAccount.button")}
            </Button>
          </div>
        </div>
      </OuterBox>

      {/* Battalion NFT Withdraw Confirmation Dialog */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent className="bg-gray-900 border-nasun-c5/30">
          <DialogHeader>
            <DialogTitle className="text-nasun-white">Withdraw from Allowlist</DialogTitle>
            <DialogDescription className="text-nasun-white/70">
              Are you sure you want to withdraw from the Battalion NFT Allowlist? You can
              re-register later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-4 mt-2">
            <Button
              variant="filledOutlineC7"
              size="default"
              onClick={() => setShowWithdrawDialog(false)}
              disabled={isWithdrawing}
              className="w-full"
            >
              Cancel
            </Button>
            <Button
              variant="filledOutlineScarlet"
              size="default"
              onClick={handleWithdraw}
              disabled={isWithdrawing}
              className="w-full"
            >
              {isWithdrawing ? "Withdrawing..." : "Withdraw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Genesis Pass Withdraw Confirmation Dialog */}
      <Dialog open={showGenesisWithdrawDialog} onOpenChange={setShowGenesisWithdrawDialog}>
        <DialogContent className="bg-gray-900 border-nasun-c5/30">
          <DialogHeader>
            <DialogTitle className="text-nasun-white">Withdraw from Genesis Pass</DialogTitle>
            <DialogDescription className="text-nasun-white/70">
              Are you sure you want to withdraw from the Genesis Pass Allowlist? You can
              re-register later from the Genesis Pass page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-4 mt-2">
            <Button
              variant="filledOutlineC7"
              size="default"
              onClick={() => setShowGenesisWithdrawDialog(false)}
              disabled={isGenesisWithdrawing}
              className="w-full"
            >
              Cancel
            </Button>
            <Button
              variant="filledOutlineScarlet"
              size="default"
              onClick={handleGenesisPassWithdraw}
              disabled={isGenesisWithdrawing}
              className="w-full"
            >
              {isGenesisWithdrawing ? "Withdrawing..." : "Withdraw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DangerZoneCard;
