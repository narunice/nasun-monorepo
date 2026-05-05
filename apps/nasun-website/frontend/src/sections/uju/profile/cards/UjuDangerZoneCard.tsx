/**
 * UjuDangerZoneCard Component
 *
 * Account Management section for UJU Profile.
 * Detached from myAccount dependencies.
 */

import { FC, useState } from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { toast } from "react-toastify";
import { useAuth } from "@/features/auth";
import { useBattalionNftStatus } from "@/hooks/useBattalionNftStatus";
import { useGenesisPassStatus, invalidateGenesisPassStatus } from "@/hooks/useGenesisPassStatus";
import { withdrawUserApi } from "@/services/battalionNftApi";
import { withdrawGenesisPass } from "@/services/genesisPassApi";
import { useBattalionNftStore } from "@/stores/useBattalionNftStore";
import { UjuCard, UjuSectionHeader, UjuButton } from "../../shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface UjuDangerZoneCardProps {
  className?: string;
}

export const UjuDangerZoneCard: FC<UjuDangerZoneCardProps> = ({ className = "" }) => {
  const { t } = useTranslation("myAccount");
  const { user, logout } = useAuth();
  const { reset: resetBattalionStore, cognitoToken: battalionCognitoToken } = useBattalionNftStore();
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [isGenesisWithdrawing, setIsGenesisWithdrawing] = useState(false);
  const [showGenesisWithdrawDialog, setShowGenesisWithdrawDialog] = useState(false);

  const twitterId = user?.twitterId ?? user?.linkedAccounts?.twitter?.twitterId;
  const effectiveXUserId = twitterId;
  const {
    status: battalionStatus,
    isRegistered: isBattalionRegistered,
  } = useBattalionNftStatus(undefined, effectiveXUserId);

  const cognitoToken = user?.cognitoToken ?? battalionCognitoToken;
  const evmWalletAddress =
    user?.linkedAccounts?.metamask?.walletAddress
    || (user?.provider === "MetaMask" ? user.walletAddress : undefined);
  const {
    isRegistered: isGenesisPassRegistered,
    isApplied: isGenesisPassApplied,
  } = useGenesisPassStatus(evmWalletAddress, cognitoToken);

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
      console.error("[UjuDangerZoneCard] Battalion withdraw error:", err);
      toast.error("Failed to withdraw. Please try again.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleGenesisPassWithdraw = async () => {
    if (isGenesisWithdrawing) return;

    if (!cognitoToken) {
      toast.error("Session expired. Please sign out and sign in again to withdraw.");
      return;
    }

    try {
      setIsGenesisWithdrawing(true);
      await withdrawGenesisPass(cognitoToken);
      setShowGenesisWithdrawDialog(false);
      toast.success("Successfully withdrawn from Genesis Pass Allowlist.");
      invalidateGenesisPassStatus();
    } catch (err) {
      console.error("[UjuDangerZoneCard] Genesis Pass withdraw error:", err);
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
      <UjuCard className={`animate-fade-slide-up ${className}`}>
        <UjuSectionHeader
          accent
          title="Account Management"
          subtitle="Irreversible account actions and allowlist control"
        />

        <div className="flex flex-col gap-6">
          {/* Withdraw Battalion NFT Allowlist */}
          {isBattalionRegistered && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 border border-red-500/20 rounded-2xl bg-red-500/[0.04]">
              <div className="min-w-0">
                <h6 className="font-normal text-uju-primary text-base mb-1">{t("accountManagement.withdraw.title")}</h6>
                <p className="text-uju-secondary text-sm leading-relaxed">{t("accountManagement.withdraw.description")}</p>
              </div>
              <UjuButton
                onClick={() => setShowWithdrawDialog(true)}
                variant="secondary"
                size="xs"
                className="text-red-400 hover:text-red-300 border-red-500/30 shrink-0"
              >
                {t("accountManagement.withdraw.button")}
              </UjuButton>
            </div>
          )}

          {/* Delete Account */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 border border-red-500/20 rounded-2xl bg-red-500/[0.04]">
            <div className="min-w-0">
              <h6 className="font-normal text-uju-primary text-base mb-1">{t("accountManagement.deleteAccount.title")}</h6>
              <p className="text-uju-secondary text-sm leading-relaxed">{t("accountManagement.deleteAccount.description")}</p>
            </div>
            <UjuButton
              onClick={handleDeleteAccount}
              variant="secondary"
              size="xs"
              className="text-red-400 hover:text-red-300 border-red-500/30 shrink-0"
            >
              {t("accountManagement.deleteAccount.button")}
            </UjuButton>
          </div>
        </div>
      </UjuCard>

      {/* Confirmation Dialogs */}
      <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
        <DialogContent className="bg-uju-bg border-uju-border text-uju-primary rounded-lg">
          <DialogHeader>
            <DialogTitle className="text-uju-primary font-normal">Withdraw from Allowlist</DialogTitle>
            <DialogDescription className="text-uju-secondary font-light">
              Are you sure you want to withdraw from the Battalion NFT Allowlist? You can
              re-register later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-4 mt-4">
            <UjuButton
              variant="secondary"
              onClick={() => setShowWithdrawDialog(false)}
              disabled={isWithdrawing}
              className="w-full justify-center"
            >
              Cancel
            </UjuButton>
            <UjuButton
              variant="primary"
              onClick={handleWithdraw}
              disabled={isWithdrawing}
              className="w-full justify-center bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30"
            >
              {isWithdrawing ? "Withdrawing..." : "Withdraw"}
            </UjuButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UjuDangerZoneCard;
