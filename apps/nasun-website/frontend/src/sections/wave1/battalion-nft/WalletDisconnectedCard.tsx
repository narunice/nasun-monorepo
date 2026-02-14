/**
 * Wallet Disconnected Card Component
 *
 * @description
 * Step 6에서 지갑 연결이 해제된 경우 표시되는 안내 카드
 * 사용자에게 지갑 재연결 또는 등록 초기화 옵션 제공
 *
 * @author Claude Code
 * @date 2025-11-02
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { ButtonV3 } from "@/components/ui/button-v3";

interface WalletDisconnectedCardProps {
  onReconnectClick: () => void;
  onResetClick: () => void;
}

/**
 * Wallet Disconnected Card 컴포넌트
 *
 * @features
 * - 지갑 연결 해제 경고 메시지
 * - 재연결 버튼 (My Account 페이지로 리디렉션)
 * - 초기화 버튼 (확인 다이얼로그 포함)
 * - 다크 모드 지원
 */
export const WalletDisconnectedCard: React.FC<WalletDisconnectedCardProps> = ({
  onReconnectClick,
  onResetClick,
}) => {
  const { t } = useTranslation("battalion-nft");

  const handleReset = () => {
    const confirmed = window.confirm(t("step6.walletDisconnected.resetConfirm"));
    if (confirmed) {
      onResetClick();
    }
  };

  return (
    <div className="bg-gray-800/80 border border-gray-700 rounded-lg shadow-lg p-5 max-w-2xl mx-auto">
      {/* Warning Header */}
      <div className="text-center mb-5">
        <div className="mb-3 flex justify-center">
          <div className="w-12 h-12 bg-yellow-900/20 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-yellow-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        <h2 className="text-lg font-semibold text-nasun-white mb-2">{t("step6.walletDisconnected.title")}</h2>
        <p className="text-sm text-gray-300">{t("step6.walletDisconnected.description")}</p>
        <p className="text-sm text-gray-300 mt-1">{t("step6.walletDisconnected.instruction")}</p>
      </div>

      {/* Information Box */}
      <div className="mb-5 p-4 bg-nasun-nw1/10 rounded-lg border border-nasun-nw1/30">
        <p className="text-sm font-medium text-nasun-nw1 mb-2">{t("step6.info.dataPreserved")}</p>
        <ul className="space-y-1 text-sm text-nasun-nw1/80">
          <li>{t("step6.info.registrationSaved")}</li>
          <li>{t("step6.info.xAccountSaved")}</li>
          <li className="text-yellow-400/80">{t("step6.info.walletNeeded")}</li>
        </ul>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        {/* Primary Action: Reconnect */}
        <ButtonV3 onClick={onReconnectClick} variant="nw1" className="w-full">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          {t("step6.walletDisconnected.reconnectButton")}
        </ButtonV3>

        {/* Secondary Action: Reset */}
        <ButtonV3 onClick={handleReset} variant="red" className="w-full">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {t("step6.walletDisconnected.resetButton")}
        </ButtonV3>
      </div>

      {/* Help Text */}
      <div className="mt-5 p-3 bg-gray-700/50 rounded-lg">
        <p className="text-xs text-gray-400 text-center">{t("step6.walletDisconnected.helpText")}</p>
      </div>
    </div>
  );
};
