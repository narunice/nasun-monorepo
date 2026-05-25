import { useEffect, useState } from "react";
import ChSection from "../home/ChSection";
import FadeInUp from "../home/FadeInUp";
import { useEpochInfo } from "@/hooks/network/useNetworkData";

type Pillar = {
  label: string;
  detail: string;
};

const PILLARS: Pillar[] = [
  {
    label: "Consensus",
    detail: "Move-based network with Mysticeti consensus.",
  },
  {
    label: "Surface",
    detail: "Nasun app.",
  },
  {
    label: "Applications",
    detail: "Pado and GoStop.",
  },
];

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${String(remaining).padStart(2, "0")}s`;
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
    const progress = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
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

export default function DevAboutNetworkSection() {
  return (
    <ChSection innerClassName="ch-about-network">
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">02 / Network</span>
        <h2 className="ch-display">
          <span className="ch-accent-pado">Execution</span>{" "}
          <span className="ch-subdued">Environment</span>
        </h2>
      </FadeInUp>

      <div className="ch-network-grid">
        <FadeInUp delayMs={150} className="ch-network-pillars">
          {PILLARS.map((p, i) => (
            <div key={p.label} className="ch-network-pillar">
              <span className="ch-network-pillar-index">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="ch-network-pillar-body">
                <span className="ch-label ch-subdued">{p.label}</span>
                <p className="ch-body">{p.detail}</p>
              </div>
            </div>
          ))}
        </FadeInUp>

        <FadeInUp delayMs={300}>
          <EpochCard />
        </FadeInUp>
      </div>
    </ChSection>
  );
}
