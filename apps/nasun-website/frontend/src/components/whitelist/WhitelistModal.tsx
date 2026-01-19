/**
 * Whitelist Modal Component
 *
 * Whitelist 등록/철회 결과를 표시하는 모달
 * - 성공: 지갑 주소 표시 + Withdraw/Close 버튼
 * - 중복: "이미 제출된 주소입니다" + Withdraw/Close 버튼
 * - 에러: 에러 메시지 표시 + Close 버튼
 * - 로딩: 스피너 표시
 *
 * UI follows Nasun design system with DividerBox components.
 * Uses span tags in DialogTitle/DialogDescription to avoid HTML nesting issues.
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
import { DividerBox, InlineLoading } from "../ui";

const METAMASK_INSTALL_URL = "https://metamask.io/download/";

// Common DialogContent className for glassmorphism effect
const dialogContentClassName = "sm:max-w-md bg-nasun-c6/90 border-nasun-c5 backdrop-blur-lg rounded-xl";

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
        <DialogContent className={dialogContentClassName}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6" />
              <span className="text-nasun-white">{t("whitelist.modal.intro.title")}</span>
            </DialogTitle>
            <DialogDescription>
              {t("whitelist.modal.intro.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Steps */}
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-nasun-c1/20 text-nasun-c1 flex items-center justify-center font-medium">
                  1
                </span>
                <div>
                  <h6 className="text-nasun-c1 !normal-case">{t("whitelist.modal.intro.step1.title")}</h6>
                  <p className="text-nasun-white/70">{t("whitelist.modal.intro.step1.description")}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-nasun-c1/20 text-nasun-c1 flex items-center justify-center font-medium">
                  2
                </span>
                <div>
                  <h6 className="text-nasun-c1 !normal-case">{t("whitelist.modal.intro.step2.title")}</h6>
                  <p className="text-nasun-white/70">{t("whitelist.modal.intro.step2.description")}</p>
                </div>
              </div>
            </div>

            {/* Notice Box */}
            <DividerBox color="c4" padding="sm">
              <p className="flex items-start gap-2">
                <span>ℹ️</span>
                <span>{t("whitelist.modal.intro.notice")}</span>
              </p>
            </DividerBox>

            {/* MetaMask Install Link */}
            <p className="text-center text-nasun-white/70">
              {t("whitelist.modal.intro.noMetaMask")}{" "}
              <a
                href={METAMASK_INSTALL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-nasun-c1 hover:text-nasun-c2 underline"
              >
                {t("whitelist.modal.intro.installLink")}
              </a>
            </p>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-3">
            <Button variant="outlineC1" onClick={handleClose} className="w-full sm:w-auto">
              {t("whitelist.modal.intro.cancel")}
            </Button>
            <Button variant="c1" onClick={handleProceed} className="w-full sm:w-auto">
              <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-5 h-5 mr-2" />
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
        <DialogContent className={dialogContentClassName}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-nasun-c1">
              <InlineLoading size="md" />
              <span>{t("whitelist.modal.connecting.title")}</span>
            </DialogTitle>
            <DialogDescription>
              {walletAddress
                ? t("whitelist.modal.connecting.checking")
                : t("whitelist.modal.connecting.description")}
            </DialogDescription>
          </DialogHeader>

          {walletAddress && (
            <div className="py-4">
              <DividerBox color="c1" padding="sm">
                <p className="flex items-center gap-2">
                  <span>🦊</span>
                  <span>Wallet: <code className="text-nasun-c1 font-mono">{formatWalletAddress(walletAddress)}</code></span>
                </p>
              </DividerBox>
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
        <DialogContent className={dialogContentClassName}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-nasun-c2">
              <InlineLoading size="md" />
              <span>{t("whitelist.modal.signing.title")}</span>
            </DialogTitle>
            <DialogDescription>
              {t("whitelist.modal.signing.description")}
            </DialogDescription>
          </DialogHeader>

          {walletAddress && (
            <div className="py-4">
              <DividerBox color="c2" padding="sm">
                <p className="flex items-center gap-2">
                  <span>✍️</span>
                  <span>Wallet: <code className="text-nasun-c2 font-mono">{formatWalletAddress(walletAddress)}</code></span>
                </p>
              </DividerBox>
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
        <DialogContent className={dialogContentClassName}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-nasun-c4">
              <InlineLoading size="md" />
              <span>{t("whitelist.modal.submitting.title")}</span>
            </DialogTitle>
            <DialogDescription>
              {t("whitelist.modal.submitting.description")}
            </DialogDescription>
          </DialogHeader>

          {walletAddress && (
            <div className="py-4">
              <DividerBox color="c4" padding="sm">
                <p className="flex items-center gap-2">
                  <span>📤</span>
                  <span>Wallet: <code className="text-nasun-c4 font-mono">{formatWalletAddress(walletAddress)}</code></span>
                </p>
              </DividerBox>
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
        <DialogContent className={dialogContentClassName}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-nasun-c3">
              <CheckCircle2 className="h-6 w-6" />
              <span>{t("whitelist.modal.success.title")}</span>
            </DialogTitle>
            <DialogDescription>
              {t("whitelist.modal.success.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <DividerBox
              color="c3"
              icon={<CheckCircle2 className="w-5 h-5" />}
              title={t("whitelist.modal.success.walletAddress")}
              padding="sm"
            >
              <code className="text-nasun-c3 break-all font-mono">{walletAddress}</code>
            </DividerBox>

            {joinedAt && (
              <p className="text-center text-nasun-white/80">
                {t("whitelist.modal.success.joinedAt")}:{" "}
                <strong className="text-nasun-white">{formatDate(joinedAt)}</strong>
              </p>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-3">
            <Button variant="outlineC3" onClick={handleWithdrawClick} className="w-full sm:w-auto">
              {t("whitelist.modal.success.withdraw")}
            </Button>
            <Button variant="c3" onClick={handleClose} className="w-full sm:w-auto">
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
        <DialogContent className={dialogContentClassName}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-nasun-c4">
              <AlertCircle className="h-6 w-6" />
              <span>{t("whitelist.modal.alreadyJoined.title")}</span>
            </DialogTitle>
            <DialogDescription>
              {t("whitelist.modal.alreadyJoined.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <DividerBox
              color="c4"
              icon={<AlertCircle className="w-5 h-5" />}
              title={t("whitelist.modal.alreadyJoined.walletAddress")}
              padding="sm"
            >
              <code className="text-nasun-c4 break-all font-mono">{walletAddress}</code>
            </DividerBox>

            {joinedAt && (
              <p className="text-center text-nasun-white/80">
                {t("whitelist.modal.alreadyJoined.joinedAt")}:{" "}
                <strong className="text-nasun-white">{formatDate(joinedAt)}</strong>
              </p>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-3">
            <Button variant="outlineC4" onClick={handleWithdrawClick} className="w-full sm:w-auto">
              {t("whitelist.modal.alreadyJoined.withdraw")}
            </Button>
            <Button variant="c4" onClick={handleClose} className="w-full sm:w-auto">
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
        <DialogContent className={dialogContentClassName}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-nasun-c4">
              <AlertCircle className="h-6 w-6" />
              <span>{t("whitelist.modal.alreadyWithdrawn.title")}</span>
            </DialogTitle>
            <DialogDescription>
              {t("whitelist.modal.alreadyWithdrawn.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <DividerBox
              color="c4"
              title={t("whitelist.modal.alreadyWithdrawn.walletAddress")}
              padding="sm"
            >
              <code className="text-nasun-c4 break-all font-mono">
                {walletAddress ? formatWalletAddress(walletAddress) : "N/A"}
              </code>
            </DividerBox>

            {modalData.withdrawnAt && (
              <p className="text-center text-nasun-white/80">
                {t("whitelist.modal.alreadyWithdrawn.withdrawnAt")}:{" "}
                <strong className="text-nasun-white">{formatDate(modalData.withdrawnAt)}</strong>
              </p>
            )}

            {walletAddress && (
              <DividerBox color="c4" padding="sm">
                <p className="flex items-center gap-2">
                  <span>💡</span>
                  <span>Wallet: {walletAddress}</span>
                </p>
              </DividerBox>
            )}
          </div>

          <DialogFooter>
            <Button variant="c4" onClick={handleClose} className="w-full">
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
        <DialogContent className={dialogContentClassName}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-nasun-coral">
              <XCircle className="h-6 w-6" />
              <span>{t("whitelist.modal.error.title")}</span>
            </DialogTitle>
            <DialogDescription>
              {t("whitelist.modal.error.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <DividerBox
              color="coral"
              icon={<XCircle className="w-5 h-5" />}
              title={t("whitelist.modal.error.errorMessage")}
              padding="sm"
            >
              <p className="text-nasun-coral">
                {error || "An unexpected error occurred. Please try again."}
              </p>
            </DividerBox>

            {walletAddress && (
              <p className="text-center text-nasun-white/80">
                Wallet: <code className="text-nasun-white font-mono">{formatWalletAddress(walletAddress)}</code>
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="coral" onClick={handleClose} className="w-full">
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
