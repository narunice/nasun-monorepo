/**
 * Whitelist Modal Component
 *
 * Whitelist 등록/철회 결과를 표시하는 모달
 * - 성공: 지갑 주소 표시 + Withdraw/Close 버튼
 * - 중복: "이미 제출된 주소입니다" + Withdraw/Close 버튼
 * - 에러: 에러 메시지 표시 + Close 버튼
 * - 로딩: 스피너 표시
 */

import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import type { WhitelistModalProps } from "../../types/whitelist";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { InlineLoading } from "../ui";

const METAMASK_INSTALL_URL = "https://metamask.io/download/";

export function WhitelistModal({ open, onOpenChange, modalData, onWithdraw, onProceed }: WhitelistModalProps) {
  const { t } = useTranslation("common");
  const { state, walletAddress, joinedAt, error } = modalData;

  /**
   * Close 버튼 핸들러
   */
  const handleClose = () => {
    onOpenChange(false);
  };

  /**
   * Withdraw 버튼 핸들러
   */
  const handleWithdrawClick = () => {
    if (onWithdraw) {
      onWithdraw();
    }
  };

  /**
   * 지갑 주소 축약 (0x1234...5678)
   */
  const formatWalletAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  /**
   * 날짜 포맷팅
   */
  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /**
   * Proceed 버튼 핸들러 (intro → connecting)
   */
  const handleProceed = () => {
    if (onProceed) {
      onProceed();
    }
  };

  // ========================================================================
  // Intro State (안내 화면)
  // ========================================================================
  if (state === "intro") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-5 h-5" />
              {t("whitelist.modal.intro.title")}
            </DialogTitle>
            <DialogDescription>{t("whitelist.modal.intro.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 절차 안내 */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-sm font-medium">
                  1
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("whitelist.modal.intro.step1.title")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("whitelist.modal.intro.step1.description")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-sm font-medium">
                  2
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("whitelist.modal.intro.step2.title")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("whitelist.modal.intro.step2.description")}
                  </p>
                </div>
              </div>
            </div>

            {/* 안심 안내 */}
            <div className="rounded-lg bg-blue-950/50 border border-blue-900/50 p-3">
              <p className="text-xs text-blue-200">
                ℹ️ {t("whitelist.modal.intro.notice")}
              </p>
            </div>

            {/* MetaMask 설치 링크 */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                {t("whitelist.modal.intro.noMetaMask")}{" "}
                <a
                  href={METAMASK_INSTALL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-400 hover:text-orange-300 underline"
                >
                  {t("whitelist.modal.intro.installLink")}
                </a>
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outlineC1" onClick={handleClose} className="w-full sm:w-auto">
              {t("whitelist.modal.intro.cancel")}
            </Button>
            <Button onClick={handleProceed} className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600">
              <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-5 h-5 mr-1" />
              {t("whitelist.modal.intro.proceed")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ========================================================================
  // Connecting State (연결 중)
  // ========================================================================
  if (state === "connecting") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <InlineLoading size="md" />
              {t("whitelist.modal.connecting.title")}
            </DialogTitle>
            <DialogDescription>
              {walletAddress
                ? t("whitelist.modal.connecting.checking")
                : t("whitelist.modal.connecting.description")}
            </DialogDescription>
          </DialogHeader>

          {walletAddress && (
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                Wallet: <span className="font-mono">{formatWalletAddress(walletAddress)}</span>
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // ========================================================================
  // Signing State (서명 중)
  // ========================================================================
  if (state === "signing") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <InlineLoading size="md" />
              {t("whitelist.modal.signing.title")}
            </DialogTitle>
            <DialogDescription>{t("whitelist.modal.signing.description")}</DialogDescription>
          </DialogHeader>

          {walletAddress && (
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                Wallet: <span className="font-mono">{formatWalletAddress(walletAddress)}</span>
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // ========================================================================
  // Submitting State (제출 중)
  // ========================================================================
  if (state === "submitting") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <InlineLoading size="md" />
              {t("whitelist.modal.submitting.title")}
            </DialogTitle>
            <DialogDescription>{t("whitelist.modal.submitting.description")}</DialogDescription>
          </DialogHeader>

          {walletAddress && (
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                Wallet: <span className="font-mono">{formatWalletAddress(walletAddress)}</span>
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // ========================================================================
  // Success State (등록 성공)
  // ========================================================================
  if (state === "success") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="h-6 w-6" />
              {t("whitelist.modal.success.title")}
            </DialogTitle>
            <DialogDescription>{t("whitelist.modal.success.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-green-950 p-4">
              <p className="text-sm font-medium text-green-100">
                {t("whitelist.modal.success.walletAddress")}
              </p>
              <p className="text-sm font-mono text-green-300 break-all mt-1">{walletAddress}</p>
            </div>

            {joinedAt && (
              <div className="text-sm text-muted-foreground">
                <p>
                  {t("whitelist.modal.success.joinedAt")}:{" "}
                  <span className="font-medium">{formatDate(joinedAt)}</span>
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outlineC1" onClick={handleWithdrawClick} className="w-full sm:w-auto">
              {t("whitelist.modal.success.withdraw")}
            </Button>
            <Button onClick={handleClose} className="w-full sm:w-auto">
              {t("whitelist.modal.success.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ========================================================================
  // Already Joined State (이미 등록됨)
  // ========================================================================
  if (state === "already_joined") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-400">
              <AlertCircle className="h-6 w-6" />
              {t("whitelist.modal.alreadyJoined.title")}
            </DialogTitle>
            <DialogDescription>{t("whitelist.modal.alreadyJoined.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-blue-950 p-4">
              <p className="text-sm font-medium text-blue-100">
                {t("whitelist.modal.alreadyJoined.walletAddress")}
              </p>
              <p className="text-sm font-mono text-blue-300 break-all mt-1">{walletAddress}</p>
            </div>

            {joinedAt && (
              <div className="text-sm text-muted-foreground">
                <p>
                  {t("whitelist.modal.alreadyJoined.joinedAt")}:{" "}
                  <span className="font-medium">{formatDate(joinedAt)}</span>
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outlineC1" onClick={handleWithdrawClick} className="w-full sm:w-auto">
              {t("whitelist.modal.alreadyJoined.withdraw")}
            </Button>
            <Button onClick={handleClose} className="w-full sm:w-auto">
              {t("whitelist.modal.alreadyJoined.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ========================================================================
  // Already Withdrawn State (이미 철회됨)
  // ========================================================================
  if (state === "already_withdrawn") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-400">
              <AlertCircle className="h-6 w-6" />
              {t("whitelist.modal.alreadyWithdrawn.title")}
            </DialogTitle>
            <DialogDescription>
              {t("whitelist.modal.alreadyWithdrawn.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-blue-950 p-4">
              <p className="text-sm font-medium text-blue-100">
                {t("whitelist.modal.alreadyWithdrawn.walletAddress")}
              </p>
              <p className="text-sm font-mono text-blue-300 break-all mt-1">
                {walletAddress ? formatWalletAddress(walletAddress) : "N/A"}
              </p>
            </div>

            {modalData.withdrawnAt && (
              <div className="text-sm text-muted-foreground">
                <p>
                  {t("whitelist.modal.alreadyWithdrawn.withdrawnAt")}:{" "}
                  <span className="font-medium">{formatDate(modalData.withdrawnAt)}</span>
                </p>
              </div>
            )}

            {walletAddress && (
              <div className="rounded-lg bg-blue-950 p-3 text-xs text-blue-200">
                💡 Wallet: {walletAddress}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={handleClose} className="w-full">
              {t("whitelist.modal.alreadyWithdrawn.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ========================================================================
  // Error State (에러 발생)
  // ========================================================================
  if (state === "error") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <XCircle className="h-6 w-6" />
              {t("whitelist.modal.error.title")}
            </DialogTitle>
            <DialogDescription>{t("whitelist.modal.error.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-red-950 p-4">
              <p className="text-sm font-medium text-red-100 mb-2">
                {t("whitelist.modal.error.errorMessage")}
              </p>
              <p className="text-sm text-red-300">
                {error || "An unexpected error occurred. Please try again."}
              </p>
            </div>

            {walletAddress && (
              <div className="text-sm text-muted-foreground">
                <p>
                  Wallet: <span className="font-mono">{formatWalletAddress(walletAddress)}</span>
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={handleClose} className="w-full">
              {t("whitelist.modal.error.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Idle state - 모달이 열리지 않음
  return null;
}
