import type { ReactNode } from "react";
import ChSection from "./ChSection";
import FadeInUp from "./FadeInUp";

type Step = {
  index: string;
  eyebrow: string;
  title: string;
  body: string;
  viz: ReactNode;
};

function VizAct() {
  return (
    <div className="ch-viz-act">
      <span className="ring" />
      <span className="ring" />
      <span className="ring" />
      <span className="dot" />
    </div>
  );
}

function VizRecord() {
  return (
    <div className="ch-viz-record">
      <span className="bar" />
      <span className="bar" />
      <span className="bar" />
      <span className="bar" />
    </div>
  );
}

function VizScore() {
  return (
    <div className="ch-viz-score">
      <svg viewBox="0 0 200 80" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ch-score-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#5ee1e4" />
            <stop offset="100%" stopColor="#d2f6a2" />
          </linearGradient>
          <linearGradient id="ch-score-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(134,243,183,0.35)" />
            <stop offset="100%" stopColor="rgba(134,243,183,0)" />
          </linearGradient>
        </defs>
        <path
          className="fill"
          d="M0 80 L0 60 L28 56 L56 50 L86 44 L114 34 L144 26 L172 16 L200 8 L200 80 Z"
          fill="url(#ch-score-fill)"
        />
        <path
          className="line"
          d="M0 60 L28 56 L56 50 L86 44 L114 34 L144 26 L172 16 L200 8"
          fill="none"
          stroke="url(#ch-score-line)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle className="tip" cx="200" cy="8" r="3" fill="#d2f6a2" />
      </svg>
    </div>
  );
}

function VizTier() {
  return (
    <div className="ch-viz-tier">
      <div className="tier-col">
        <div className="tier-bar" style={{ height: "32%" }}>
          <span />
        </div>
        <span className="tier-label">T1</span>
      </div>
      <div className="tier-col">
        <div className="tier-bar" style={{ height: "58%" }}>
          <span />
        </div>
        <span className="tier-label">T2</span>
      </div>
      <div className="tier-col">
        <div className="tier-bar active" style={{ height: "88%" }}>
          <span />
        </div>
        <span className="tier-label">T3</span>
      </div>
    </div>
  );
}

function VizUnlock() {
  return (
    <div className="ch-viz-unlock">
      <svg viewBox="0 0 56 64" fill="none">
        <defs>
          <linearGradient id="ch-unlock" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#5ee1e4" />
            <stop offset="100%" stopColor="#d2f6a2" />
          </linearGradient>
          <radialGradient id="ch-unlock-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(134,243,183,0.55)" />
            <stop offset="100%" stopColor="rgba(134,243,183,0)" />
          </radialGradient>
        </defs>
        <circle className="glow" cx="28" cy="44" r="22" fill="url(#ch-unlock-glow)" />
        <g className="shackle">
          <path
            d="M16 30 V20 a12 12 0 0 1 24 0 V30"
            stroke="url(#ch-unlock)"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </g>
        <rect
          x="10"
          y="30"
          width="36"
          height="26"
          rx="4"
          stroke="url(#ch-unlock)"
          strokeWidth="1.75"
          fill="rgba(134,243,183,0.06)"
        />
        <circle className="keyhole" cx="28" cy="42" r="2.5" fill="url(#ch-unlock)" />
        <rect className="keyhole" x="27" y="44" width="2" height="6" rx="1" fill="url(#ch-unlock)" />
      </svg>
    </div>
  );
}

const STEPS: Step[] = [
  {
    index: "01",
    eyebrow: "Action",
    title: "Act",
    body: "A user or agent transacts onchain.",
    viz: <VizAct />,
  },
  {
    index: "02",
    eyebrow: "Capture",
    title: "Record",
    body: "Behavior is captured as an onchain receipt.",
    viz: <VizRecord />,
  },
  {
    index: "03",
    eyebrow: "Scoring",
    title: "Score",
    body: "Receipts update the Nasun Standing Index.",
    viz: <VizScore />,
  },
  {
    index: "04",
    eyebrow: "Resolution",
    title: "Tier",
    body: "NSI resolves to an authority tier at runtime.",
    viz: <VizTier />,
  },
  {
    index: "05",
    eyebrow: "Permission",
    title: "Unlock",
    body: "Tier sets capital limits, leverage, and agent permissions.",
    viz: <VizUnlock />,
  },
];

export default function DevHomeMechanismSection() {
  return (
    <ChSection>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">03 / Mechanism</span>
        <h2 className="ch-display">
          The <span className="ch-accent-pado">Compounding Loop</span>
        </h2>
        <p className="ch-lead">
          Every action a user or agent takes feeds the loop.
          <br />
          Every action a future user or agent takes inherits from it.
        </p>
      </FadeInUp>

      <div className="ch-step-grid">
        {STEPS.map((s, i) => (
          <FadeInUp key={s.index} delayMs={120 + i * 90}>
            <article className="ch-step-card">
              <header className="ch-step-card-header">
                <span className="ch-step-card-eyebrow">{s.eyebrow}</span>
                <span className="ch-step-card-num">{s.index}</span>
              </header>
              <h3 className="ch-step-card-title">{s.title}</h3>
              <p className="ch-step-card-body">{s.body}</p>
              <div className="ch-step-card-viz">{s.viz}</div>
            </article>
          </FadeInUp>
        ))}
      </div>

      <FadeInUp delayMs={700} className="max-w-[720px]">
        <p className="ch-body" style={{ color: "var(--ch-fg-default)" }}>
          Operator history shapes agent permissions. Agent activity feeds back into operator
          standing. Trust becomes a <span className="ch-accent">portable, compounding asset</span>.
        </p>
      </FadeInUp>
    </ChSection>
  );
}
