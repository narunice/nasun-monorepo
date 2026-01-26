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
import type { NftWhitelist } from "@/types/battalion-nft";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { useNavigate } from "react-router-dom";
import { DividerBox } from "@/components/ui";
import { BattalionNftCard } from "../BattalionNftCard";

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

  const openseaCollectionUrl = "https://opensea.io/collection/wave1-battalion-nasun"; // TODO: 실제 Collection URL로 변경

  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleString("ko-KR", {
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
    <BattalionNftCard>
      {/* Success Header */}
      <div className="text-center mb-8">
        <div className="mb-4 flex justify-center">
          <div className="w-20 h-20 bg-green-950 rounded-full flex items-center justify-center">
            <svg
              className="w-12 h-12 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>

        <h3 className="!font-rubik font-medium mb-2">{t("step6.title")}</h3>
        <p className="max-w-md mx-auto">{t("step6.description")}</p>
      </div>

      {/* Wallet Disconnected Warning */}
      {!isWalletConnected && (
        <DividerBox color="c5" icon="⚠️" className="!py-4 mb-6">
          <p className="mb-3">{t("step6.walletDisconnectedWarning")}</p>
          <Button
            onClick={() => navigate("/my-account")}
            variant="default"
            size="sm"
            className="w-full bg-yellow-600 hover:bg-yellow-700"
          >
            {t("step6.goToMyAccount")}
          </Button>
        </DividerBox>
      )}

      {/* Whitelist Info - 등록 정보 */}
      <DividerBox
        color="c7"
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
        className="!py-4 mb-8"
      >
        <div className="space-y-2 text-nasun-white/80">
          {/* Allowlist Batch 표시 */}
          {whitelist.allowlistBatchId && (
            <p>
              <span className="font-medium">{t("step6.info.allowlistBatch")}:</span>{" "}
              <span className="block md:inline text-nasun-c7 font-semibold">
                Allowlist #{whitelist.allowlistBatchId}
              </span>
            </p>
          )}
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

      {/* Minting Guide */}
      <DividerBox
        color="c4"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        }
        title={t("step6.mintingGuide.title")}
        className="!py-4 mb-8"
      >
        <div className="space-y-3">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-6 h-6 bg-nasun-c4 text-white rounded-full flex items-center justify-center text-sm">
                {step}
              </div>
              <p className="flex-1">
                {/* @ts-expect-error - 동적 키 타입 에러를 무시합니다 */}
                {t(`step6.mintingGuide.step${step}`)}
              </p>
            </div>
          ))}
        </div>
        <p className="text-yellow-200 flex items-center pt-3 gap-2">
          <svg
            className="w-6 h-6 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span>{t("step6.mintingGuide.note")}</span>
        </p>
      </DividerBox>

      {/* OpenSea Button */}
      <Button variant="c5" size="lg" className="w-full" asChild>
        <a
          href={openseaCollectionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161l-5.119 7.707a.234.234 0 01-.195.104h-2.305a.117.117 0 01-.098-.181l5.119-7.707a.234.234 0 01.195-.104h2.305c.093 0 .146.106.098.181z" />
          </svg>
          <span>{t("step6.mintingGuide.button")}</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </Button>

      {/* Share Section */}
      <div className="mt-8 lg:mt-10 text-center">
        <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4">
          <p>{t("step6.sharePrompt")}</p>
          <Button onClick={handleShareToTwitter} variant="c1" size="md">
            <span>{t("share")}</span>
            <FontAwesomeIcon icon={faXTwitter} className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="mt-4 lg:mt-6 flex flex-col sm:flex-row gap-4">
        <Button onClick={() => navigate("/")} variant="outlineC4" className="w-full">
          {t("goToHome")}
        </Button>
        <Button onClick={() => navigate("/my-account")} variant="outlineC4" className="w-full">
          {t("goToMyAccount")}
        </Button>
      </div>
    </BattalionNftCard>
  );
};
