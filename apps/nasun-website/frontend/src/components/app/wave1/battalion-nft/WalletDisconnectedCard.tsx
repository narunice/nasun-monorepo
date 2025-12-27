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
import { Button } from "../../../ui/button";

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
    <div className="bg-gray-800/80 border border-gray-700 rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
      {/* Warning Header */}
      <div className="text-center mb-8">
        <div className="mb-6 flex justify-center">
          <div className="w-20 h-20 bg-yellow-900/20 rounded-full flex items-center justify-center">
            <svg
              className="w-12 h-12 text-yellow-500"
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

        <h2 className="text-nasun-white mb-4">{t("step6.walletDisconnected.title")}</h2>
        <p className="text-gray-300 mb-2">{t("step6.walletDisconnected.description")}</p>
        <p className="text-gray-300">{t("step6.walletDisconnected.instruction")}</p>
      </div>

      {/* Information Box */}
      <div className="mb-8 p-6 bg-nasun-c4/20 rounded-lg border border-nasun-c4/40">
        <div className="flex items-start space-x-3">
          <svg
            className="w-6 h-6 text-nasun-c4 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="flex-1">
            <h3 className="text-nasun-c4 mb-2">📝 {t("step6.info.dataPreserved")}</h3>
            <ul className="space-y-2 text-nasun-c4">
              <li>✅ {t("step6.info.registrationSaved")}</li>
              <li>✅ {t("step6.info.xAccountSaved")}</li>
              <li>⚠️ {t("step6.info.walletNeeded")}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-4">
        {/* Primary Action: Reconnect */}
        <Button onClick={onReconnectClick} variant="c5" className="w-full" size="lg">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          {t("step6.walletDisconnected.reconnectButton")}
        </Button>

        {/* Secondary Action: Reset */}
        <Button onClick={handleReset} variant="destructive" className="w-full" size="lg">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {t("step6.walletDisconnected.resetButton")}
        </Button>
      </div>

      {/* Help Text */}
      <div className="mt-8 p-4 bg-gray-700 rounded-lg">
        <p className="text-gray-400 text-center">💡 {t("step6.walletDisconnected.helpText")}</p>
      </div>
    </div>
  );
};
