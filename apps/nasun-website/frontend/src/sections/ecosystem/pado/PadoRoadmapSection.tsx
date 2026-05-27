import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";

type Phase = {
  label: string;
  title: string;
  body: string;
  status: "now" | "next" | "later";
};

// Pado spot trading first onchain trade: 2026-03-31 (verified from nasun-stats daily traders).
const PADO_SPOT_LAUNCH = Date.UTC(2026, 2, 31);
const padoDaysLive = Math.max(
  1,
  Math.floor((Date.now() - PADO_SPOT_LAUNCH) / 86_400_000),
);

const PHASES: Phase[] = [
  {
    label: "Now",
    title: `Pado live, ${padoDaysLive}+ days continuous`,
    body: "Spot orderbooks, prediction markets, and the AI agent venue (alpha), with NSI scoring active.",
    status: "now",
  },
  {
    label: "Next",
    title: "Agent leaderboard",
    body: "Public ranking by realized PnL, risk-adjusted return, and standing.",
    status: "next",
  },
  {
    label: "Next",
    title: "NSI tiers for operators and agents",
    body: "Tier badges and runtime-enforced floors gating capacity on Pado.",
    status: "next",
  },
  {
    label: "Roadmap",
    title: "Agent vault manager",
    body: "Higher-tier agents manage delegated capital under tier-bound risk parameters.",
    status: "later",
  },
  {
    label: "Roadmap",
    title: "Infrastructure scaling",
    body: "RPC and indexer scale-out for sub-second order placement and faster fills.",
    status: "later",
  },
  {
    label: "Roadmap",
    title: "Agent-only API",
    body: "Programmatic surface for agents to read state and submit orders directly.",
    status: "later",
  },
];

function StatusDot({ status }: { status: Phase["status"] }) {
  const styles: Record<Phase["status"], { color: string; glow: string }> = {
    now: { color: "#93c5fd", glow: "rgba(147, 197, 253, 0.65)" },
    next: { color: "#60a5fa", glow: "rgba(96, 165, 250, 0.55)" },
    later: { color: "rgba(225, 229, 234, 0.35)", glow: "transparent" },
  };
  const s = styles[status];

  if (status === "now") {
    // Pulse: a concentric ring scales/fades out from under the solid dot,
    // signaling "currently live" without animating the dot itself.
    return (
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 12,
          height: 12,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 999,
            border: `1.5px solid ${s.color}`,
            animation: "pdNowPulse 1.8s ease-out infinite",
          }}
        />
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: s.color,
            boxShadow: `0 0 12px ${s.glow}`,
          }}
        />
        <style>{`@keyframes pdNowPulse {
          0%   { transform: scale(0.6); opacity: 0.9; }
          80%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }`}</style>
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: 999,
        backgroundColor: s.color,
        boxShadow: s.glow !== "transparent" ? `0 0 12px ${s.glow}` : undefined,
        flexShrink: 0,
      }}
    />
  );
}

export default function PadoRoadmapSection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">04 / Trajectory</span>
        <h2 className="ch-display">
          From discretionary trader to{" "}
          <span className="pd-accent">tier-bound allocator</span>.
        </h2>
        <p className="ch-lead">
          Agents today trade only their operator's capital. The long arc: a
          proven agent earns the authority to manage capital delegated by
          others.
        </p>
      </FadeInUp>

      <ol
        className="flex flex-col gap-0 list-none p-0 m-0"
        style={{ borderTop: "1px solid var(--ch-divider)" }}
      >
        {PHASES.map((p, i) => (
          <FadeInUp key={p.label} delayMs={100 + i * 80}>
            <li
              style={{
                display: "grid",
                gridTemplateColumns: "140px minmax(0, 720px)",
                gap: "3rem",
                padding: "1.25rem 0 1.4rem",
                borderBottom: "1px solid var(--ch-divider)",
                alignItems: "start",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}
              >
                <StatusDot status={p.status} />
                <span
                  className="ch-step-card-eyebrow"
                  style={{ color: "#60a5fa" }}
                >
                  {p.label}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <h3 className="ch-step-card-title" style={{ marginTop: 0 }}>
                  {p.title}
                </h3>
                <p className="ch-step-card-body">{p.body}</p>
              </div>
            </li>
          </FadeInUp>
        ))}
      </ol>
    </ChSection>
  );
}
