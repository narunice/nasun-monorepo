/**
 * 🆕 Rank History: RankHistoryChart Component
 *
 * @description
 * 사용자의 랭킹 변화 추이를 선 그래프로 표시하는 컴포넌트입니다.
 * recharts 라이브러리를 사용하여 반응형 차트를 구현합니다.
 *
 * @author Claude Code
 * @date 2025-10-26
 */

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { RankHistoryEntry } from "../types/leaderboard";
import { useTranslation } from "react-i18next";

export interface RankHistoryChartProps {
  history: RankHistoryEntry[];
  height?: number; // 차트 높이 (기본값: 400px)
}

/**
 * 차트 데이터 포인트 타입
 */
interface ChartDataPoint {
  date: string; // YYYY-MM-DD
  rank: number;
  score: number;
  displayDate: string; // 표시용 날짜 (MM/DD 또는 M월 D일)
}

/**
 * 커스텀 툴팁 props 타입
 */
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}

/**
 * 커스텀 툴팁 컴포넌트
 */
const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  const { t, i18n } = useTranslation(["myAccount", "common"]);

  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload as ChartDataPoint;
  const isKorean = i18n.language === "ko";

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-3">
      <p className="font-semibold text-white mb-2">{data.displayDate}</p>
      <div className="space-y-1">
        <p className="text-gray-300">
          <span className="font-medium">{t("rankHistory.chart.rank")}:</span>{" "}
          <span className="font-bold text-blue-400">
            {isKorean ? `${data.rank}위` : `#${data.rank}`}
          </span>
        </p>
        <p className="text-gray-300">
          <span className="font-medium">{t("rankHistory.chart.score")}:</span>{" "}
          <span className="font-bold text-green-400">{(data.score ?? 0).toFixed(1)}</span>
        </p>
      </div>
    </div>
  );
};

/**
 * RankHistoryChart 컴포넌트
 *
 * @param history - 랭킹 히스토리 엔트리 배열
 * @param height - 차트 높이 (기본값: 400px)
 *
 * @example
 * <RankHistoryChart history={historyData} />
 *
 * @example
 * // 커스텀 높이
 * <RankHistoryChart history={historyData} height={300} />
 */
export const RankHistoryChart: React.FC<RankHistoryChartProps> = ({ history, height = 400 }) => {
  const { t, i18n } = useTranslation(["myAccount", "common"]);
  const isKorean = i18n.language === "ko";

  // 차트 데이터 준비
  const chartData: ChartDataPoint[] = React.useMemo(() => {
    return history.map((entry) => {
      const date = new Date(entry.date);
      const month = date.getMonth() + 1;
      const day = date.getDate();

      return {
        date: entry.date,
        rank: entry.rank,
        score: entry.finalScore ?? 0, // finalScore가 없는 경우 0으로 대체
        displayDate: isKorean ? `${month}월 ${day}일` : `${month}/${day}`,
      };
    });
  }, [history, isKorean]);

  // Y축 범위 계산 (순위가 낮을수록 좋으므로 역순)
  const ranks = chartData.map((d) => d.rank);
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  const rankPadding = Math.max(1, Math.ceil((maxRank - minRank) * 0.1)); // 10% 패딩

  const yAxisDomain = [
    Math.max(1, minRank - rankPadding), // 최소 1위
    maxRank + rankPadding,
  ];

  // 데이터가 없는 경우
  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-900 rounded-lg border border-gray-700"
        style={{ height: `${height}px` }}
      >
        <p className="text-gray-400">{t("rankHistory.chart.noData")}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
          <XAxis
            dataKey="displayDate"
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            stroke="#4b5563"
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            reversed={true} // 순위 역순 (낮을수록 좋음)
            domain={yAxisDomain}
            tick={{ fill: "#9ca3af", fontSize: 12 }}
            stroke="#4b5563"
            label={{
              value: t("rankHistory.chart.yAxisLabel"),
              angle: -90,
              position: "insideLeft",
              style: { textAnchor: "middle", fill: "#9ca3af", fontSize: 12 },
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="rank"
            stroke="rgb(59, 130, 246)" // blue-500
            strokeWidth={3}
            dot={{
              fill: "rgb(59, 130, 246)",
              strokeWidth: 2,
              r: 4,
            }}
            activeDot={{
              r: 6,
              fill: "rgb(37, 99, 235)", // blue-600
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
