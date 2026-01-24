import React, { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Link as LinkIcon, Download } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { MyRankCard, MyRankCardRef } from "./MyRankCard";
import { CumulativePeriod } from "@/types";

/**
 * Local MyRankCardData type (defined here because ../types doesn't export it).
 * Adjust fields if the real type in your project differs.
 */
interface MyRankCardData {
  status: string;
  userRank?: {
    page?: number;
    username: string;
  } | null;
}

interface ShareButtonsGroupProps {
  period: CumulativePeriod;
  date: string | null;
  onViewRank: (page: number, username: string) => void;
  onBackToLatest: () => void;
  myRankCardRef: RefObject<MyRankCardRef>;
  myRankData: MyRankCardData;
}

/**
 * ShareButtonsGroup - 나의 랭킹 카드 + 공유 버튼 그룹
 *
 * @description
 * MyRankCard와 공유 버튼들을 포함하는 컴포넌트입니다.
 * CumulativeLeaderboard에서 추출되어 재사용 가능합니다.
 */
const ShareButtonsGroup: React.FC<ShareButtonsGroupProps> = ({
  period,
  date,
  onViewRank,
  onBackToLatest,
  myRankCardRef,
  myRankData,
}) => {
  const { t } = useTranslation("leaderboard");

  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      {/* 왼쪽: MyRankCard (ref={myRankCardRef}) */}
      <div className="flex-1">
        <MyRankCard
          ref={myRankCardRef}
          period={period}
          date={date || undefined}
          onBackToLatest={onBackToLatest}
          onViewRank={onViewRank}
        />
      </div>

      {/* 오른쪽: 공유 버튼들 (카드 외부 - 스크린샷 제외됨) */}
      {myRankData.status === "ranked" && myRankData.userRank && (
        <div className="grid grid-cols-2 sm:flex sm:flex-col gap-2 w-full sm:w-auto sm:min-w-[180px]">
          {/* View My Rank 버튼 */}
          {onViewRank && myRankData.userRank.page && (
            <Button
              onClick={() => {
                if (myRankData.userRank) {
                  onViewRank(myRankData.userRank.page!, myRankData.userRank.username);
                }
              }}
              variant="outlineC2"
              className="w-full"
            >
              {t("myRank.viewRankButton")}
            </Button>
          )}

          {/* Share to X 버튼 */}
          <Button
            onClick={() => myRankCardRef.current?.handleShareToTwitter()}
            variant="c1"
            className="w-full flex items-center justify-center gap-2"
          >
            <FontAwesomeIcon icon={faXTwitter} className="w-4 h-4" />
            <span>{t("myRank.shareOptions.twitter")}</span>
          </Button>

          {/* Copy Link 버튼 */}
          <Button
            onClick={() => myRankCardRef.current?.handleCopyLink()}
            variant="c1"
            className="w-full flex items-center justify-center gap-2"
          >
            <LinkIcon size={16} />
            <span>{t("myRank.shareOptions.copyLink")}</span>
          </Button>

          {/* Download Image 버튼 */}
          <Button
            onClick={() => myRankCardRef.current?.handleDownloadImage()}
            variant="c1"
            disabled={myRankCardRef.current?.getIsGeneratingImage()}
            className="w-full flex items-center justify-center gap-2"
          >
            <Download size={16} />
            <span>
              {myRankCardRef.current?.getIsGeneratingImage()
                ? t("share.generatingImage")
                : t("myRank.shareOptions.downloadImage")}
            </span>
          </Button>
        </div>
      )}
    </div>
  );
};

export default ShareButtonsGroup;
