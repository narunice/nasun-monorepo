import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChSection from "../home/ChSection";
import FadeInUp from "../home/FadeInUp";
import { useEpochInfo, useTPS } from "@/hooks/network/useNetworkData";
import { useTPSHistory } from "@/hooks/network/useTPSHistory";

// Nasun devnet has been live since 2026-03-26 (per litepaper § 3 "Operational
// Signal"). Anchor the live uptime counter to this timestamp so the card
// continues to climb daily without manual updates.
const DEVNET_LAUNCH_TS = Date.parse("2026-03-26T00:00:00Z");

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${String(remaining).padStart(2, "0")}s`;
}

function getUptimeParts(launch: number, now: number) {
  const total = Math.max(0, now - launch);
  const totalSeconds = Math.floor(total / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

function UptimeCard() {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const t = getUptimeParts(DEVNET_LAUNCH_TS, now);
  const clock = `${String(t.hours).padStart(2, "0")}:${String(t.minutes).padStart(2, "0")}:${String(t.seconds).padStart(2, "0")}`;

  return (
    <div className="ch-epoch-card ch-uptime-card">
      <div className="ch-epoch-card-head">
        <span className="ch-label ch-subdued">Continuity</span>
        <span className="ch-epoch-card-title">Devnet Uptime</span>
      </div>

      <div className="ch-uptime-display">
        <div className="ch-uptime-days">
          <span className="ch-uptime-days-num">{t.days}</span>
          <span className="ch-uptime-days-label">consecutive days</span>
        </div>
        <div className="ch-uptime-clock">
          <span className="ch-uptime-clock-value">{clock}</span>
          <span className="ch-uptime-clock-label">since launch</span>
        </div>
      </div>

      <div className="ch-uptime-meta">
        <span className="ch-epoch-grid-label">Online since</span>
        <span className="ch-epoch-grid-value">
          {new Date(DEVNET_LAUNCH_TS).toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "UTC",
          })}{" "}
          UTC
        </span>
      </div>
    </div>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function EpochCard() {
  const { data: epochInfo, isLoading } = useEpochInfo();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const tick = (() => {
    if (!epochInfo) return null;
    const remaining = Math.max(0, epochInfo.endTimestamp - now);
    const elapsed = epochInfo.endTimestamp - epochInfo.startTimestamp - remaining;
    const total = epochInfo.endTimestamp - epochInfo.startTimestamp;
    const progress =
      total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
    return { remaining, progress };
  })();

  return (
    <div className="ch-epoch-card">
      <div className="ch-epoch-card-head">
        <span className="ch-label ch-subdued">Network</span>
        <span className="ch-epoch-card-title">Epoch Progress</span>
      </div>

      {isLoading || !epochInfo || !tick ? (
        <div className="ch-epoch-skeleton">
          <span className="ch-body ch-subdued" style={{ fontSize: "0.8125rem" }}>
            Loading network state…
          </span>
        </div>
      ) : (
        <>
          <div className="ch-epoch-row">
            <span className="ch-epoch-epoch">Epoch {epochInfo.epoch}</span>
            <span className="ch-epoch-remaining">
              {formatDuration(tick.remaining)} remaining
            </span>
          </div>

          <div className="ch-epoch-bar-wrap" aria-hidden="true">
            <div className="ch-epoch-bar">
              <div
                className="ch-epoch-bar-fill"
                style={{ width: `${tick.progress}%` }}
              />
            </div>
            <span className="ch-epoch-pct">{tick.progress.toFixed(1)}%</span>
          </div>

          <div className="ch-epoch-grid">
            <div>
              <div className="ch-epoch-grid-label">Started</div>
              <div className="ch-epoch-grid-value">
                {formatTime(epochInfo.startTimestamp)}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="ch-epoch-grid-label">Est. End</div>
              <div className="ch-epoch-grid-value">
                {formatTime(epochInfo.endTimestamp)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TpsCard() {
  const { data: tps } = useTPS();
  const history = useTPSHistory(tps ?? null);
  const latest = tps ?? null;
  const peak = history.length > 0 ? Math.max(...history.map((d) => d.tps)) : 0;

  return (
    <div className="ch-epoch-card ch-tps-card">
      <div className="ch-epoch-card-head">
        <span className="ch-label ch-subdued">Throughput</span>
        <span className="ch-epoch-card-title">TPS Trend</span>
      </div>

      <div className="ch-tps-row">
        <div>
          <div className="ch-epoch-grid-label">Current</div>
          <div className="ch-tps-current">
            {latest !== null ? latest.toFixed(1) : "—"}
            <span className="ch-tps-unit">tx/s</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="ch-epoch-grid-label">Peak (session)</div>
          <div className="ch-tps-peak">{peak > 0 ? peak.toFixed(1) : "—"}</div>
        </div>
      </div>

      <div className="ch-tps-chart">
        {history.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={history}
              margin={{ top: 4, right: 6, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="ch-tps-stroke" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#5ee1e4" />
                  <stop offset="100%" stopColor="#d2f6a2" />
                </linearGradient>
                <linearGradient id="ch-tps-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(134, 243, 183, 0.30)" />
                  <stop offset="100%" stopColor="rgba(134, 243, 183, 0)" />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                tick={{ fill: "rgba(249,249,249,0.45)", fontSize: 9 }}
                axisLine={{ stroke: "rgba(249,249,249,0.08)" }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={36}
              />
              <YAxis
                tick={{ fill: "rgba(249,249,249,0.45)", fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={28}
                domain={[0, "auto"]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(15, 17, 19, 0.95)",
                  border: "1px solid rgba(94, 225, 228, 0.35)",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontFamily: "var(--ch-font-mono)",
                  padding: "0.4rem 0.6rem",
                }}
                labelStyle={{ color: "rgba(249,249,249,0.55)", marginBottom: 2 }}
                itemStyle={{ color: "#d2f6a2" }}
                formatter={(value) => [`${(value as number).toFixed(2)} tx/s`, "TPS"]}
                cursor={{ stroke: "rgba(94, 225, 228, 0.35)", strokeDasharray: "3 3" }}
              />
              <Area
                type="monotone"
                dataKey="tps"
                stroke="url(#ch-tps-stroke)"
                strokeWidth={1.75}
                fill="url(#ch-tps-fill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="ch-tps-chart-empty">
            <span className="ch-body ch-subdued" style={{ fontSize: "0.75rem" }}>
              Sampling network ({history.length}/2)…
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

type Capability = {
  label: string;
  title: string;
  body: string;
};

const PROTOCOL: Capability[] = [
  {
    label: "01",
    title: "Tier resolution at runtime",
    body:
      "Every action settles through the protocol, updating the Nasun Standing Index. The runtime resolves NSI into an authority tier at execution. Native apps inherit it as a non-optional floor, not a per-app configuration.",
  },
  {
    label: "02",
    title: "Capital is bound to the signal",
    body:
      "Validators and executors stake NSN to participate. Authority enforcement is backed by skin in the game, and the behavioral economy aligns directly with protocol economics.",
  },
  {
    label: "03",
    title: "Settlement, not signaling",
    body:
      "NSI moves on settlement receipts, agent execution records, and verified outcomes. Quests, badges, and self-attestation cannot move the score.",
  },
];

const INTEGRATION: Capability[] = [
  {
    label: "01",
    title: "Conditional orders, by tier",
    body:
      "Cross-margin access, leverage minimums, liquidation parameters, and order routing read directly from the operator's tier. Pricing and risk are no longer per-app heuristics.",
  },
  {
    label: "02",
    title: "Agent execution, closed loop",
    body:
      "The AI runtime publishes execution receipts onchain. Receipts feed NSI. Operator-inherited permissions cap agent authority. The same loop that earned the floor governs the agent inside it.",
  },
  {
    label: "03",
    title: "Emissions and gas, tier-weighted",
    body:
      "Emissions, gas sponsorship, and fee routing operate at the protocol layer. Higher standing receives more by construction, not by application discretion.",
  },
];

export default function DevAboutNetworkSection() {
  return (
    <ChSection innerClassName="ch-about-network" fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">02 / Network</span>
        <h2 className="ch-display" style={{ maxWidth: "880px" }}>
          <span className="ch-accent-pado">Execution</span>{" "}
          <span className="ch-subdued">Environment</span>
        </h2>
        <p className="ch-body" style={{ maxWidth: "820px" }}>
          Nasun runs on its own Move-based L1 with Mysticeti consensus.
          Behavioral authority is a runtime property, not an application
          setting, and that is precisely why tier enforcement is
          non-optional. Owning the runtime is what makes earned standing
          economically real.
        </p>
      </FadeInUp>

      <FadeInUp delayMs={150}>
        <div className="ch-network-signals-wrap">
          <UptimeCard />
          <div className="ch-network-signals">
            <EpochCard />
            <TpsCard />
          </div>
        </div>
      </FadeInUp>

      <div className="ch-network-capabilities">
        <FadeInUp delayMs={200} className="ch-network-column">
          <header className="ch-network-column-head">
            <span className="ch-label ch-accent">Protocol</span>
            <h3 className="ch-network-column-title">
              What the runtime guarantees
            </h3>
          </header>
          <ul className="ch-network-list">
            {PROTOCOL.map((c) => (
              <li key={c.label} className="ch-network-item">
                <span className="ch-network-item-index">{c.label}</span>
                <div>
                  <h4 className="ch-network-item-title">{c.title}</h4>
                  <p className="ch-network-item-body">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </FadeInUp>

        <FadeInUp delayMs={320} className="ch-network-column">
          <header className="ch-network-column-head">
            <span
              className="ch-label"
              style={{ color: "var(--ch-accent-cyan)" }}
            >
              Vertical Integration
            </span>
            <h3 className="ch-network-column-title">
              What the apps inherit
            </h3>
          </header>
          <ul className="ch-network-list">
            {INTEGRATION.map((c) => (
              <li key={c.label} className="ch-network-item">
                <span
                  className="ch-network-item-index"
                  style={{ color: "var(--ch-accent-cyan)" }}
                >
                  {c.label}
                </span>
                <div>
                  <h4 className="ch-network-item-title">{c.title}</h4>
                  <p className="ch-network-item-body">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </FadeInUp>
      </div>
    </ChSection>
  );
}
