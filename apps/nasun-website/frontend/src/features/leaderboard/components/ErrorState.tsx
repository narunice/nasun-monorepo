import React, { memo } from "react";
import { CSS_CLASSES } from "../constants";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface ErrorStateProps {
  error: string;
  onRetry: () => void;
  onViewLatest?: () => void;
}

const ErrorState: React.FC<ErrorStateProps> = memo(({ error, onRetry, onViewLatest }) => {
  const { t, i18n } = useTranslation(["leaderboard", "common"]);

  // 에러 타입 판별
  const isSnapshotNotFound = error.includes("SNAPSHOT_NOT_FOUND");
  const isNetworkError = error.includes("NETWORK_ERROR") || error.includes("Failed to fetch");

  // 스냅샷 없음 에러인 경우
  if (isSnapshotNotFound) {
    const date = error.split(":")[1] || "";

    return (
      <SectionLayout>
        <div className="text-center py-12">
          <div className="bg-nasun-black border border-nasun-white/20 rounded-lg p-8 max-w-md mx-auto">
            <div className="text-5xl mb-4">📅</div>
            <p
              className={`text-white mb-2 ${
                i18n.language === "ko" ? "font-medium" : "font-semibold"
              }`}
            >
              {i18n.language === "ko"
                ? "선택한 날짜에 생성된 리더보드가 없습니다"
                : "No leaderboard found for the selected date"}
            </p>
            <p className="text-nasun-white/70 mb-6">
              {date &&
                (i18n.language === "ko"
                  ? `${date} 날짜의 스냅샷이 존재하지 않습니다.`
                  : `Snapshot for ${date} does not exist.`)}
            </p>
            {onViewLatest && (
              <Button
                onClick={onViewLatest}
                variant="default"
                size="lg"
                className={i18n.language === "ko" ? "font-medium" : "font-semibold"}
              >
                {i18n.language === "ko" ? "최신 리더보드 보기" : "View Latest Leaderboard"}
              </Button>
            )}
          </div>
        </div>
      </SectionLayout>
    );
  }

  // 일반 에러 (네트워크 에러 등)
  return (
    <SectionLayout>
      <div className="text-center py-8">
        <div className={CSS_CLASSES.ERROR_CONTAINER}>
          <p className={`${i18n.language === "ko" ? "font-normal" : "font-semibold"}`}>
            {t("states.errorLoading")}
          </p>
          <p className="text-nasun-white/70 mt-1">
            {isNetworkError
              ? i18n.language === "ko"
                ? "네트워크 연결을 확인해주세요."
                : "Please check your network connection."
              : error.split(":")[1] || error}
          </p>
          <Button
            onClick={onRetry}
            variant="default"
            className={`mt-4 ${i18n.language === "ko" ? "font-normal" : "font-semibold"}`}
          >
            {t("states.retry")}
          </Button>
        </div>
      </div>
    </SectionLayout>
  );
});

ErrorState.displayName = "ErrorState";

export default ErrorState;
