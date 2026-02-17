import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import { Card } from '../ui/Card';
import { formatDateLabel, formatCompactNumber } from '../../lib/analytics/analytics-aggregator';
import type { TradingActivityData } from '../../lib/analytics/types';

interface TradingActivityChartProps {
  data: TradingActivityData[] | undefined;
  isLoading: boolean;
}

// Custom Tooltip Component for dual-axis chart
function CustomTradingTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || !payload.length) return null;

  const tradeCount = payload.find((p) => p.dataKey === 'tradeCount')?.value ?? 0;
  const volumeUsd = payload.find((p) => p.dataKey === 'volumeUsd')?.value ?? 0;

  return (
    <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
      <p className="text-foreground font-medium mb-2">{label}</p>
      <div className="space-y-1">
        <p className="text-sm">
          <span className="text-muted-foreground">Trades: </span>
          <span className="text-foreground font-semibold">{tradeCount.toLocaleString('en-US')}</span>
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Volume: </span>
          <span className="text-foreground font-semibold">
            ${typeof volumeUsd === 'number' ? volumeUsd.toLocaleString('en-US', { maximumFractionDigits: 0 }) : volumeUsd}
          </span>
        </p>
      </div>
    </div>
  );
}

export function TradingActivityChart({ data, isLoading }: TradingActivityChartProps) {
  if (isLoading) {
    return (
      <Card variant="default" className="p-4 animate-pulse">
        <div className="h-3 w-48 bg-muted/40 rounded mb-4" />
        <div className="h-[250px] bg-muted/20 rounded" />
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card variant="default" className="p-8 text-center">
        <p className="text-muted-foreground">No trading activity yet.</p>
        <p className="text-sm text-muted-foreground mt-2">
          Be the first to trade on{' '}
          <a
            href="https://pado.finance"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ne1 hover:underline"
          >
            Pado
          </a>
          !
        </p>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatDateLabel(d.date),
  }));

  return (
    <Card variant="default" className="p-4">
      <div className="text-muted-foreground text-sm uppercase tracking-wider mb-2">
        Trading Activity
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Trading volumes are shown in devnet test tokens (NBTC, NUSDC) with no real monetary value.
      </p>
      <div className="h-[280px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: '#7d9dbf', fontSize: 10 }}
              axisLine={{ stroke: '#7d9dbf', opacity: 0.2 }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: '#7d9dbf', fontSize: 10 }}
              axisLine={{ stroke: '#7d9dbf', opacity: 0.2 }}
              tickLine={false}
              width={40}
              tickFormatter={(v: number) => formatCompactNumber(v)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#3b82f6', fontSize: 10 }}
              axisLine={{ stroke: '#3b82f6', opacity: 0.2 }}
              tickLine={false}
              width={50}
              tickFormatter={(v: number) => `$${formatCompactNumber(v)}`}
            />
            <Tooltip content={<CustomTradingTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }}
              formatter={(value: string) => (value === 'tradeCount' ? 'Trades' : 'Volume (USD)')}
            />
            <Bar
              yAxisId="left"
              dataKey="tradeCount"
              fill="#7d9dbf"
              radius={[2, 2, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="volumeUsd"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
