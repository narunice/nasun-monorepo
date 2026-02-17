import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { DashboardCard } from "@/components/ui/DashboardCard";
import type { TPSDataPoint } from "../../../../hooks/network/types";

interface TPSChartProps {
  data: TPSDataPoint[];
}

export function TPSChart({ data }: TPSChartProps) {
  return (
    <DashboardCard className="p-4 !bg-gray-950 !border-nasun-nw1/40">
      <div className="flex items-center justify-between mb-4">
        <div className="text-nasun-white/60 text-xs uppercase tracking-widest font-semibold">
          TPS Trend
        </div>
        <div className="text-[10px] text-nasun-white/40 tracking-tight">
          ({data.length} data points)
        </div>
      </div>
      {data.length >= 2 ? (
        <div className="h-[180px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="tpsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#448BBB" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#448BBB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                tick={{ fill: "rgba(250,247,244,0.3)", fontSize: 9 }}
                axisLine={{ stroke: "rgba(250,247,244,0.1)" }}
                tickLine={false}
                minTickGap={60}
              />
              <YAxis
                tick={{ fill: "rgba(250,247,244,0.3)", fontSize: 9 }}
                axisLine={{ stroke: "rgba(250,247,244,0.1)" }}
                tickLine={false}
                domain={[0, "auto"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(25, 22, 21, 0.95)",
                  border: "1px solid rgba(68, 139, 187, 0.3)",
                  borderRadius: "8px",
                  color: "#faf7f4",
                  fontSize: "12px",
                }}
                itemStyle={{ color: "#94e1d3" }}
                labelStyle={{ color: "rgba(250,247,244,0.6)", marginBottom: "4px" }}
                formatter={(value) => [`${value} tx/s`, "TPS"]}
              />
              <Area
                type="monotone"
                dataKey="tps"
                stroke="#448BBB"
                strokeWidth={2}
                fill="url(#tpsGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[180px] flex flex-col items-center justify-center text-nasun-white/30 text-xs gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border border-nasun-c3 border-t-transparent" />
          <span>Syncing real-time network data...</span>
        </div>
      )}
    </DashboardCard>
  );
}
