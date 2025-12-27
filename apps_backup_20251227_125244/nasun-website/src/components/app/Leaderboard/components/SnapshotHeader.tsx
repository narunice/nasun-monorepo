import React from "react";
import { useTranslation } from "react-i18next";
import { DatePicker } from "./DatePicker";

interface SnapshotHeaderProps {
  selectedDate: string | null;
  onDateChange: (date: string | null) => void;
  displayDate: React.ReactNode;
  generationTimestamp: string | null;
  isSnapshotMode: boolean;
  loading: boolean;
}

/**
 * SnapshotHeader - 스냅샷 뷰어 및 업데이트 시간 표시
 *
 * @description
 * DatePicker와 스냅샷/업데이트 시간을 표시하는 헤더 컴포넌트입니다.
 * CumulativeLeaderboard에서 추출되어 재사용 가능합니다.
 */
const SnapshotHeader: React.FC<SnapshotHeaderProps> = ({
  selectedDate,
  onDateChange,
  displayDate,
  generationTimestamp,
  isSnapshotMode,
  loading,
}) => {
  const { t } = useTranslation("leaderboard");

  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0 mb-2">
      {/* 스냅샷 뷰어 (좌측) - 레이블이 DatePicker 내부로 이동 */}
      <div className="w-full md:w-auto">
        <DatePicker
          selectedDate={selectedDate}
          onDateChange={onDateChange}
          placeholder={t("snapshot.datePlaceholder")}
          disabled={loading}
          label={t("snapshot.title")}
        />
      </div>

      {/* 업데이트 시간 (우측) */}
      <div className="flex gap-2 text-nasun-white/70">
        <span>{displayDate}</span>
        {generationTimestamp && (
          <span className="text-nasun-white/50">
            {isSnapshotMode
              ? t("displayDate.snapshotCreated", { timestamp: generationTimestamp })
              : t("displayDate.lastUpdated", { timestamp: generationTimestamp })}
          </span>
        )}
      </div>
    </div>
  );
};

export default SnapshotHeader;
