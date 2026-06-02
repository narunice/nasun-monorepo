import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { VaultNavPoint } from "../lib/vaultApi";
import { NAV_SCALE } from "../lib/amount";

interface VaultNavChartProps {
  navSeries: VaultNavPoint[];
}

interface Point {
  ts: number;
  nav: number;
  source: string;
}

// NAV/share over time, built from the indexed trade/flow/fee NAV points.
// NAV hovers near 1.0, so the Y domain is padded around the observed range
// (an [0, auto] domain would render every series as a flat line at 1.0 and
// hide the drift that is the whole point of the chart).
export function VaultNavChart({ navSeries }: VaultNavChartProps) {
  const data = useMemo<Point[]>(() => {
    const pts: Point[] = [];
    for (const p of navSeries) {
      // Fields are typed string from the API; Number("") === 0 would slip a
      // Number.isFinite check and plant a bogus point at NAV 0 / epoch 1970,
      // collapsing the domain. Require non-empty + strictly positive.
      if (p.timestamp_ms === "" || p.nav === "") continue;
      const ts = Number(p.timestamp_ms);
      const nav = Number(p.nav) / NAV_SCALE;
      if (!Number.isFinite(ts) || ts <= 0) continue;
      if (!Number.isFinite(nav) || nav <= 0) continue;
      pts.push({ ts, nav, source: p.source });
    }
    pts.sort((a, b) => a.ts - b.ts);
    return pts;
  }, [navSeries]);

  const domain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [0.99, 1.01];
    // Single pass (avoids Math.min(...spread) blowing the arg-count cap on a
    // long-lived vault's history).
    let min = data[0].nav;
    let max = data[0].nav;
    for (const p of data) {
      if (p.nav < min) min = p.nav;
      if (p.nav > max) max = p.nav;
    }
    const pad = Math.max((max - min) * 0.15, 0.0001);
    return [min - pad, max + pad];
  }, [data]);

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">NAV / share</h2>
        <span className="text-[10px] text-gray-500">{data.length} points</span>
      </div>
      {data.length >= 2 ? (
        <div className="h-[200px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <AreaChart data={data} margin={{ top: 5, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="vaultNavGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#448BBB" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#448BBB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tick={{ fill: "rgba(250,247,244,0.3)", fontSize: 9 }}
                axisLine={{ stroke: "rgba(250,247,244,0.1)" }}
                tickLine={false}
                minTickGap={50}
                tickFormatter={(ts: number) =>
                  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                }
              />
              <YAxis
                tick={{ fill: "rgba(250,247,244,0.3)", fontSize: 9 }}
                axisLine={{ stroke: "rgba(250,247,244,0.1)" }}
                tickLine={false}
                domain={domain}
                width={56}
                tickFormatter={(v: number) => v.toFixed(4)}
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
                labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("en-US")}
                formatter={(value, _name, item) => [
                  `${Number(value).toFixed(6)} (${(item?.payload as Point | undefined)?.source ?? ""})`,
                  "NAV/share",
                ]}
              />
              <Area
                type="monotone"
                dataKey="nav"
                stroke="#448BBB"
                strokeWidth={2}
                fill="url(#vaultNavGradient)"
                isAnimationActive={false}
                dot={data.length <= 12}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[200px] items-center justify-center text-xs text-gray-500">
          {data.length === 1
            ? "Only one NAV point so far. Chart appears after the next trade or flow."
            : "No NAV history yet."}
        </div>
      )}
    </div>
  );
}
