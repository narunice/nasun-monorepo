/**
 * Step 5 Confirmation Card
 *
 * @description
 * NFT Event의 다섯 번째 단계 - 입력 정보 확인 및 최종 등록
 *
 * @author Claude Code
 * @date 2025-11-02
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../../ui/button";
import { InlineLoading, DividerBox } from "../../../../ui";
import { BattalionNftCard } from "../BattalionNftCard";

interface Step5ConfirmationCardProps {
  xUsername: string;
  walletAddress: string | null;
  isRegistering: boolean;
  onRegister: () => void;
}

export const Step5ConfirmationCard: React.FC<Step5ConfirmationCardProps> = ({
  xUsername,
  walletAddress,
  isRegistering,
  onRegister,
}) => {
  const { t } = useTranslation("battalion-nft");

  return (
    <BattalionNftCard>
      {/* Header - 모바일: 세로, 데스크톱: 가로 배치 (중앙 정렬) */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 mb-6">
        <div className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 bg-nasun-c1/20 rounded-full flex items-center justify-center">
          <svg
            className="w-10 h-10 md:w-12 md:h-12 text-nasun-c1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div className="text-center ">
          <h3 className="!font-rubik font-medium mb-2">{t("step5.title")}</h3>
          <p className="max-w-md">{t("step5.description")}</p>
        </div>
      </div>

      {/* Summary */}
      <DividerBox color="c3" className="mb-8 text-left">
        {/* X Account & Wallet - 모바일: 세로, 데스크톱: 가로 */}
        <div className="flex flex-col md:flex-row md:gap-8 space-y-4 md:space-y-0 mb-4">
          <div className="flex-1">
            <p className="mb-1 font-medium">{t("step5.labels.xAccount")}:</p>
            <p>@{xUsername}</p>
          </div>
          <div className="flex-1">
            <p className="mb-1 font-medium">{t("step5.labels.walletAddress")}:</p>
            <p>
              {walletAddress
                ? `${walletAddress.slice(0, 10)}...${walletAddress.slice(-8)}`
                : t("step5.walletNotConnected")}
            </p>
          </div>
        </div>
        {/* All Tasks Completed */}
        <div className="flex items-center space-x-2">
          <span className="text-green-500">{t("step5.allTasksCompleted")}</span>
        </div>
      </DividerBox>

      <Button
        onClick={onRegister}
        disabled={isRegistering}
        variant="c5"
        className="w-full uppercase"
        size="xl"
      >
        {isRegistering ? (
          <InlineLoading message={t("step5.registering")} size="md" />
        ) : (
          <span>{t("step5.button")}</span>
        )}
      </Button>
    </BattalionNftCard>
  );
};
