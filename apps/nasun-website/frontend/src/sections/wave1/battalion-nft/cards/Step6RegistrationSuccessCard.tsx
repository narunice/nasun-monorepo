/**
 * Registration Success Card Component
 *
 * @description
 * 화이트리스트 등록 완료 및 OpenSea 민팅 안내 카드 컴포넌트
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import React from "react";
import { useTranslation } from "react-i18next";
import type { NftWhitelist } from "../../../../types/battalion-nft";
import { ButtonV3 } from "@/components/ui/button-v3";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { useNavigate } from "react-router-dom";
import { DividerBox, OuterBox } from "@/components/ui";
import { useAuth } from "@/features/auth";

interface RegistrationSuccessCardProps {
  whitelist: NftWhitelist;
  isWalletConnected?: boolean;
}

/**
 * Registration Success Card 컴포넌트
 *
 * @features
 * - 등록 완료 축하 메시지
 * - 지갑 주소, X 사용자명, 등록 시간 표시
 * - OpenSea 민팅 가이드 (4단계)
 * - OpenSea 링크 버튼
 * - 지갑 연결 해제 시 경고 배너 표시
 */
export const RegistrationSuccessCard: React.FC<RegistrationSuccessCardProps> = ({
  whitelist,
  isWalletConnected = true,
}) => {
  const { t } = useTranslation("battalion-nft");
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const shortenAddress = (address: string): string => {
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  const handleShareToTwitter = () => {
    const shareText = t("step6.shareMessage");
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank");
  };

  return (
    <>
      <OuterBox color="nw0" className=" max-w-3xl mx-auto">
        {/* Success Header */}
        <div className="text-center mb-4">
          <h4 className="!font-rubik font-medium mb-2">{t("step6.title")}</h4>
          <p className="">{t("step6.description")}</p>
        </div>

        {/* Wallet Disconnected Warning */}
        {!isWalletConnected && (
          <DividerBox color="nw1" padding="sm" icon="⚠️" className="mb-6">
            <p className="mb-3">{t("step6.walletDisconnectedWarning")}</p>
            <ButtonV3
              onClick={() => navigate(isAuthenticated ? "/my-account" : "/")}
              variant="nw2"
              size="sm"
              className="w-full !bg-yellow-600 hover:bg-yellow-700"
            >
              {isAuthenticated ? t("step6.goToMyAccount") : t("goToHome")}
            </ButtonV3>
          </DividerBox>
        )}

        {/* Whitelist Info - 등록 정보 */}
        <DividerBox
          color="nw4"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          }
          title={t("step6.info.title")}
          padding="sm"
          className="mb-8"
        >
          <div className="space-y-2 text-nasun-white/80">
            <p>
              <span className="font-medium">{t("step6.info.wallet")}:</span>{" "}
              <span className="block md:inline">{shortenAddress(whitelist.walletAddress)}</span>
            </p>
            <p>
              <span className="font-medium">{t("step5.labels.xAccount")}:</span>{" "}
              <span className="block md:inline">@{whitelist.xUsername}</span>
            </p>
            <p>
              <span className="font-medium">{t("step6.info.registeredAt")}:</span>{" "}
              <span className="block md:inline">{formatDate(whitelist.verifiedAt)}</span>
            </p>
          </div>
        </DividerBox>

        {/* Navigation Buttons */}
        <div className="mt-4 lg:mt-6 flex flex-col sm:flex-row gap-4">
          <ButtonV3
            onClick={handleShareToTwitter}
            variant="nw1"
            outline
            size="md"
            className="w-full"
          >
            <span>{t("step6.shareEventOnX")}</span>
            <FontAwesomeIcon icon={faXTwitter} className="w-4 h-4 ml-1" />
          </ButtonV3>
          {isAuthenticated ? (
            <ButtonV3
              onClick={() => navigate("/my-account")}
              variant="nw1"
              outline
              size="md"
              className="w-full"
            >
              {t("goToMyAccount")}
            </ButtonV3>
          ) : (
            <ButtonV3
              onClick={() => navigate("/")}
              variant="nw1"
              outline
              size="md"
              className="w-full"
            >
              {t("goToHome")}
            </ButtonV3>
          )}
        </div>
      </OuterBox>
    </>
  );
};
