/**
 * RankHistoryChartV3 Component
 *
 * Displays the user's rank history as a line chart.
 * Uses recharts library for responsive chart rendering.
 */

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import type { RankHistoryEntry } from '../types';

export interface RankHistoryChartV3Props {
  history: RankHistoryEntry[];
  height?: number;
}

interface ChartDataPoint {
  date: string;
  rank: number;
  score: number;
  displayDate: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  const { t, i18n } = useTranslation(['myAccount', 'common']);

  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload as ChartDataPoint;
  const isKorean = i18n.language === 'ko';

  return (
    <div className="bg-nasun-c6 border border-nasun-c4/30 rounded-lg shadow-lg p-3">
      <p className="font-semibold text-white mb-2">{data.displayDate}</p>
      <div className="space-y-1">
        <p className="text-gray-300">
          <span className="font-medium">{t('rankHistory.chart.rank')}:</span>{' '}
          <span className="font-bold text-nasun-c7">
            {isKorean ? `${data.rank}` : `#${data.rank}`}
          </span>
        </p>
        <p className="text-gray-300">
          <span className="font-medium">{t('rankHistory.chart.score')}:</span>{' '}
          <span className="font-bold text-nasun-c7">{(data.score ?? 0).toFixed(2)}</span>
        </p>
      </div>
    </div>
  );
};

export const RankHistoryChartV3: React.FC<RankHistoryChartV3Props> = ({
  history,
  height = 200,
}) => {
  const { t, i18n } = useTranslation(['myAccount', 'common']);
  const isKorean = i18n.language === 'ko';

  // Prepare chart data
  const chartData: ChartDataPoint[] = React.useMemo(() => {
    return history.map((entry) => {
      const date = new Date(entry.date);
      const month = date.getMonth() + 1;
      const day = date.getDate();

      return {
        date: entry.date,
        rank: entry.rank,
        score: entry.userScore ?? 0,
        displayDate: isKorean ? `${month}/${day}` : `${month}/${day}`,
      };
    });
  }, [history, isKorean]);

  // Calculate Y-axis range (ranks are reversed - lower is better)
  const ranks = chartData.map((d) => d.rank);
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  const rankPadding = Math.max(1, Math.ceil((maxRank - minRank) * 0.1));

  const yAxisDomain = [
    Math.max(1, minRank - rankPadding),
    maxRank + rankPadding,
  ];

  // No data case
  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-nasun-c6/50 rounded-lg border border-nasun-c4/20"
        style={{ height: `${height}px` }}
      >
        <p className="text-gray-400">{t('rankHistory.chart.noData')}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -10, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(59, 130, 246, 0.1)" />
          <XAxis
            dataKey="displayDate"
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            stroke="rgba(59, 130, 246, 0.2)"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            reversed={true}
            domain={yAxisDomain}
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            stroke="rgba(59, 130, 246, 0.2)"
            tickLine={false}
            axisLine={false}
            width={30}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="rank"
            stroke="rgb(59, 130, 246)" // nasun-c4
            strokeWidth={2}
            dot={{
              fill: 'rgb(59, 130, 246)',
              strokeWidth: 0,
              r: 3,
            }}
            activeDot={{
              r: 5,
              fill: 'rgb(255, 255, 255)',
              stroke: 'rgb(59, 130, 246)',
              strokeWidth: 2,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
