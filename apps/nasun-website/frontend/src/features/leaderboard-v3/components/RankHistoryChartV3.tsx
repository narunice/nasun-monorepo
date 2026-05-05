/**
 * RankHistoryChartV3 Component
 *
 * Displays the user's rank history as a line chart.
 * Uses recharts library for responsive chart rendering.
 * Fills internal date gaps with null rank to indicate "unranked" periods.
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
import { useStaticTranslation as useTranslation } from '@/providers/i18n/StaticTranslationProvider';
import type { RankHistoryEntry } from '../types';

export interface RankHistoryChartV3Props {
  history: RankHistoryEntry[];
  height?: number;
}

interface ChartDataPoint {
  date: string;
  rank: number | null;
  score: number;
  displayDate: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  const { t } = useTranslation(['myAccount', 'common']);

  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload as ChartDataPoint;

  if (data.rank === null) {
    return (
      <div className="bg-nasun-c6 border border-nasun-c4/30 rounded-lg shadow-lg p-3">
        <p className="font-semibold text-white mb-2">{data.displayDate}</p>
        <p className="text-gray-400">Chart Out</p>
      </div>
    );
  }

  return (
    <div className="bg-nasun-c6 border border-nasun-c4/30 rounded-lg shadow-lg p-3">
      <p className="font-semibold text-white mb-2">{data.displayDate}</p>
      <div className="space-y-1">
        <p className="text-gray-300">
          <span className="font-medium">{t('rankHistory.chart.rank')}:</span>{' '}
          <span className="font-bold text-nasun-c7">
            {`#${data.rank}`}
          </span>
        </p>
        <p className="text-gray-300">
          <span className="font-medium">{t('rankHistory.chart.score')}:</span>{' '}
          <span className="font-bold text-nasun-c7">{(data.score ?? 0).toFixed(3)}</span>
        </p>
      </div>
    </div>
  );
};

/**
 * Generate all YYYY-MM-DD strings between start and end (inclusive).
 */
function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (current <= last) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function formatDisplayDate(dateStr: string): string {
  const [, monthStr, dayStr] = dateStr.split('-');
  return `${parseInt(monthStr, 10)}/${parseInt(dayStr, 10)}`;
}

export const RankHistoryChartV3: React.FC<RankHistoryChartV3Props> = ({
  history,
  height = 200,
}) => {
  const { t } = useTranslation(['myAccount', 'common']);

  // Prepare chart data with gap-filling for unranked periods
  const chartData: ChartDataPoint[] = React.useMemo(() => {
    if (history.length === 0) return [];

    // Build lookup of existing entries by date
    const entryByDate = new Map<string, RankHistoryEntry>();
    for (const entry of history) {
      entryByDate.set(entry.date, entry);
    }

    // Generate full date range (internal gaps only: first entry to last entry)
    const firstDate = history[0].date;
    const lastDate = history[history.length - 1].date;
    const allDates = generateDateRange(firstDate, lastDate);

    // Also add trailing unranked entries up to yesterday (UTC)
    // to show when a user has recently dropped off the leaderboard
    const now = new Date();
    const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    if (yesterdayStr > lastDate) {
      const trailingDates = generateDateRange(
        // Start from day after last ranked entry
        (() => {
          const d = new Date(lastDate + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() + 1);
          return d.toISOString().split('T')[0];
        })(),
        yesterdayStr
      );
      allDates.push(...trailingDates);
    }

    return allDates.map((date) => {
      const entry = entryByDate.get(date);
      return {
        date,
        rank: entry ? entry.rank : null,
        score: entry ? (entry.userScore ?? 0) : 0,
        displayDate: formatDisplayDate(date),
      };
    });
  }, [history]);

  // Filter ranked entries for Y-axis domain calculation
  const rankedData = chartData.filter((d): d is ChartDataPoint & { rank: number } => d.rank !== null);

  // No ranked data at all
  if (chartData.length === 0 || rankedData.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-nasun-c6/50 rounded-lg border border-nasun-c4/20"
        style={{ height: `${height}px` }}
      >
        <p className="text-gray-400">{t('rankHistory.chart.noData')}</p>
      </div>
    );
  }

  // Calculate Y-axis range from ranked entries only (ranks are reversed - lower is better)
  const ranks = rankedData.map((d) => d.rank);
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  const rankPadding = Math.max(1, Math.ceil((maxRank - minRank) * 0.1));

  const yAxisDomain = [
    Math.max(1, minRank - rankPadding),
    maxRank + rankPadding,
  ];

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
            stroke="rgb(59, 130, 246)"
            strokeWidth={2}
            connectNulls={false}
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
