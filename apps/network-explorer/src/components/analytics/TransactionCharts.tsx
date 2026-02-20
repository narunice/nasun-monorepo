import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { Card } from '../ui/Card';
import { formatDateLabel, formatCompactNumber } from '../../lib/analytics/analytics-aggregator';
import type { TxHistoryData } from '../../lib/analytics/types';

interface TransactionChartsProps {
  data: TxHistoryData[] | undefined;
  isLoading: boolean;
}

// Custom Tooltip Component for better readability
function CustomTooltip({ active, payload, label, valueLabel }: Partial<TooltipContentProps<number, string>> & { valueLabel: string }) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
      <p className="text-foreground font-medium mb-1">{label}</p>
      <p className="text-foreground text-sm">
        <span className="text-muted-foreground">{valueLabel}: </span>
        <span className="font-semibold">{payload[0].value?.toLocaleString('en-US')}</span>
      </p>
    </div>
  );
}

export function TransactionCharts({ data, isLoading }: TransactionChartsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card variant="default" className="p-4 animate-pulse">
          <div className="h-3 w-40 bg-muted/40 rounded mb-4" />
          <div className="h-[220px] bg-muted/20 rounded" />
        </Card>
        <Card variant="default" className="p-4 animate-pulse">
          <div className="h-3 w-48 bg-muted/40 rounded mb-4" />
          <div className="h-[220px] bg-muted/20 rounded" />
        </Card>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card variant="default" className="p-8 text-center">
        <p className="text-muted-foreground">No transaction data available yet.</p>
        <p className="text-sm text-muted-foreground mt-1">Data will appear as the network processes transactions.</p>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatDateLabel(d.date),
  }));

  return (
    <div className="space-y-4">
      {/* Daily Transactions Bar Chart */}
      <Card variant="default" className="p-4">
        <div className="text-muted-foreground text-sm uppercase tracking-wider mb-4">
          Daily Transactions
        </div>
        <div className="h-[220px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fill: '#7d9dbf', fontSize: 10 }}
                axisLine={{ stroke: '#7d9dbf', opacity: 0.2 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#7d9dbf', fontSize: 10 }}
                axisLine={{ stroke: '#7d9dbf', opacity: 0.2 }}
                tickLine={false}
                width={50}
                tickFormatter={(v: number) => formatCompactNumber(v)}
              />
              <Tooltip content={<CustomTooltip valueLabel="Transactions" />} cursor={{ fill: 'rgba(125, 157, 191, 0.1)' }} />
              <Bar dataKey="dailyTx" fill="#7d9dbf" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Cumulative Transactions Area Chart */}
      <Card variant="default" className="p-4">
        <div className="text-muted-foreground text-sm uppercase tracking-wider mb-4">
          Cumulative Transactions
        </div>
        <div className="h-[220px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cumulativeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fill: '#7d9dbf', fontSize: 10 }}
                axisLine={{ stroke: '#7d9dbf', opacity: 0.2 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#7d9dbf', fontSize: 10 }}
                axisLine={{ stroke: '#7d9dbf', opacity: 0.2 }}
                tickLine={false}
                width={50}
                tickFormatter={(v: number) => formatCompactNumber(v)}
              />
              <Tooltip content={<CustomTooltip valueLabel="Cumulative TX" />} />
              <Area
                type="monotone"
                dataKey="cumulativeTx"
                stroke="#2dd4bf"
                strokeWidth={2}
                fill="url(#cumulativeGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
