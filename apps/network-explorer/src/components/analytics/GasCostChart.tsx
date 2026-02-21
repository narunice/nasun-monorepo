import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { Card } from '../ui/Card';
import { getDailyGas } from '../../lib/explorer-api';

interface GasCostChartProps {
  range: '7d' | '14d' | '30d';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Format MIST (SOE) values to compact human-readable form
function formatSoeCompact(mist: number): string {
  const soe = mist / 1_000_000_000;
  if (soe >= 1_000_000) return `${(soe / 1_000_000).toFixed(1)}M`;
  if (soe >= 1_000) return `${(soe / 1_000).toFixed(1)}K`;
  if (soe >= 1) return `${soe.toFixed(1)}`;
  if (mist >= 1_000_000) return `${(mist / 1_000_000).toFixed(1)}M SOE`;
  if (mist >= 1_000) return `${(mist / 1_000).toFixed(0)}K SOE`;
  return `${mist} SOE`;
}

function formatSoeTooltip(mist: number): string {
  const soe = mist / 1_000_000_000;
  if (soe >= 1) return `${soe.toLocaleString('en-US', { maximumFractionDigits: 4 })} NSN`;
  return `${mist.toLocaleString('en-US')} SOE`;
}

function ChartTooltip({ active, payload, label, valueLabel }: Partial<TooltipContentProps<number, string>> & { valueLabel: string }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
      <p className="text-foreground font-medium mb-1">{label}</p>
      <p className="text-foreground text-sm">
        <span className="text-muted-foreground">{valueLabel}: </span>
        <span className="font-semibold">{formatSoeTooltip(payload[0].value ?? 0)}</span>
      </p>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <Card variant="default" className="p-4 animate-pulse">
      <div className="h-3 w-40 bg-muted/40 rounded mb-4" />
      <div className="h-[220px] bg-muted/20 rounded" />
    </Card>
  );
}

export function GasCostChart({ range }: GasCostChartProps) {
  const { data: dailyGas, isLoading } = useQuery({
    queryKey: ['indexer-daily-gas', range],
    queryFn: () => getDailyGas(range),
    staleTime: 5 * 60 * 1000,
  });

  const hasData = dailyGas && dailyGas.length > 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    );
  }

  if (!hasData) {
    return (
      <Card variant="default" className="p-8 text-center">
        <p className="text-muted-foreground">Gas data not available yet.</p>
        <p className="text-sm text-muted-foreground mt-1">
          The indexer may still be syncing. Charts will appear once data is available.
        </p>
      </Card>
    );
  }

  const gasCostData = dailyGas.map((d) => ({
    label: formatDate(d.date),
    gasCost: Number(d.totalGasCost),
  }));

  const avgGasData = dailyGas.map((d) => ({
    label: formatDate(d.date),
    avgGas: Number(d.avgGasPerTx),
  }));

  return (
    <div className="space-y-4">
      <Card variant="default" className="p-4">
        <div className="text-muted-foreground text-sm uppercase tracking-wider mb-4">
          Daily Gas Cost
        </div>
        <div className="h-[220px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
            <BarChart data={gasCostData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
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
                width={60}
                tickFormatter={(v: number) => formatSoeCompact(v)}
              />
              <Tooltip content={<ChartTooltip valueLabel="Gas Cost" />} cursor={{ fill: 'rgba(245, 158, 11, 0.1)' }} />
              <Bar dataKey="gasCost" fill="#f59e0b" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card variant="default" className="p-4">
        <div className="text-muted-foreground text-sm uppercase tracking-wider mb-4">
          Average Gas Per Transaction
        </div>
        <div className="h-[220px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
            <AreaChart data={avgGasData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="avgGasGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
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
                width={60}
                tickFormatter={(v: number) => formatSoeCompact(v)}
              />
              <Tooltip content={<ChartTooltip valueLabel="Avg Gas/TX" />} />
              <Area
                type="monotone"
                dataKey="avgGas"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="url(#avgGasGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
