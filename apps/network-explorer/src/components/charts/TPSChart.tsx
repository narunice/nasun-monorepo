import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Card } from '../ui/Card';
import type { TPSDataPoint } from '../../hooks/types';

interface TPSChartProps {
  data: TPSDataPoint[];
}

export function TPSChart({ data }: TPSChartProps) {
  return (
    <Card variant="default" className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-muted-foreground text-sm uppercase tracking-wider">TPS Trend</div>
        <div className="text-xs text-muted-foreground">(Last {data.length} updates)</div>
      </div>
      {data.length >= 2 ? (
        <div className="h-[200px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tpsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                tick={{ fill: '#888888', fontSize: 10 }}
                axisLine={{ stroke: '#888888', opacity: 0.2 }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#888888', fontSize: 10 }}
                axisLine={{ stroke: '#888888', opacity: 0.2 }}
                tickLine={false}
                width={40}
                domain={[0, 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  borderColor: 'var(--border)',
                  borderRadius: '8px',
                  color: 'var(--foreground)',
                }}
                labelStyle={{ color: 'var(--muted-foreground)' }}
                formatter={(value) => [`${value} tx/s`, 'TPS']}
              />
              <Area
                type="monotone"
                dataKey="tps"
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#tpsGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
          Collecting data... ({data.length}/2 points)
        </div>
      )}
    </Card>
  );
}
