import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Card } from '../ui/Card';
import type { TPSDataPoint } from '../../hooks/types';

interface TPSChartProps {
  data: TPSDataPoint[];
}

export function TPSChart({ data }: TPSChartProps) {
  return (
    <Card variant="c6" className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-nasun-white/60 text-sm uppercase tracking-wider">TPS Trend</div>
        <div className="text-xs text-nasun-white/40">(Last {data.length} updates)</div>
      </div>
      {data.length >= 2 ? (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tpsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
                width={40}
                domain={[0, 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(30, 41, 59, 0.95)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: '8px',
                  color: '#fff',
                }}
                labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
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
        <div className="h-[200px] flex items-center justify-center text-nasun-white/40 text-sm">
          Collecting data... ({data.length}/2 points)
        </div>
      )}
    </Card>
  );
}
