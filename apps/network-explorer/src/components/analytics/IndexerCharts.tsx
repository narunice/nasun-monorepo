import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { Card } from '../ui/Card';
import { getDailyTransactions, getActiveAddresses } from '../../lib/explorer-api';

interface IndexerChartsProps {
  range: '7d' | '14d' | '30d';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function ChartTooltip({ active, payload, label, valueLabel }: Partial<TooltipContentProps<number, string>> & { valueLabel: string }) {
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

function ChartSkeleton() {
  return (
    <Card variant="default" className="p-4 animate-pulse">
      <div className="h-3 w-40 bg-muted/40 rounded mb-4" />
      <div className="h-[220px] bg-muted/20 rounded" />
    </Card>
  );
}

export function IndexerCharts({ range }: IndexerChartsProps) {
  const { data: dailyTx, isLoading: txLoading } = useQuery({
    queryKey: ['indexer-daily-tx', range],
    queryFn: () => getDailyTransactions(range),
    staleTime: 5 * 60 * 1000,
  });

  const { data: activeAddr, isLoading: addrLoading } = useQuery({
    queryKey: ['indexer-active-addr', range],
    queryFn: () => getActiveAddresses(range),
    staleTime: 5 * 60 * 1000,
  });

  const hasTxData = dailyTx && dailyTx.length > 0;
  const hasAddrData = activeAddr && activeAddr.length > 0;

  if (txLoading && addrLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    );
  }

  if (!hasTxData && !hasAddrData) {
    return (
      <Card variant="default" className="p-8 text-center">
        <p className="text-muted-foreground">Indexer data not available yet.</p>
        <p className="text-sm text-muted-foreground mt-1">
          The indexer may still be syncing. Charts will appear once data is available.
        </p>
      </Card>
    );
  }

  const txChartData = (dailyTx ?? []).map((d) => ({
    label: formatDate(d.date),
    transactions: d.transactions,
  }));

  const addrChartData = (activeAddr ?? []).map((d) => ({
    label: formatDate(d.date),
    activeAddresses: d.activeAddresses,
  }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {hasTxData && (
        <Card variant="default" className="p-4 min-w-0">
          <div className="text-muted-foreground text-sm uppercase tracking-wider mb-4">
            Daily Transactions (Indexer)
          </div>
          <div className="h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
              <BarChart data={txChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
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
                  tickFormatter={(v: number) => formatCompact(v)}
                />
                <Tooltip content={<ChartTooltip valueLabel="Transactions" />} cursor={{ fill: 'rgba(125, 157, 191, 0.1)' }} />
                <Bar dataKey="transactions" fill="#7d9dbf" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {hasAddrData && (
        <Card variant="default" className="p-4 min-w-0">
          <div className="text-muted-foreground text-sm uppercase tracking-wider mb-4">
            Daily Active Addresses (Indexer)
          </div>
          <div className="h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
              <AreaChart data={addrChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="activeAddrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
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
                  tickFormatter={(v: number) => formatCompact(v)}
                />
                <Tooltip content={<ChartTooltip valueLabel="Active Addresses" />} />
                <Area
                  type="monotone"
                  dataKey="activeAddresses"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  fill="url(#activeAddrGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
