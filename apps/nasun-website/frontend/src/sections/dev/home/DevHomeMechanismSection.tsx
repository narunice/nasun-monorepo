import type { ReactNode } from "react";
import ChSection from "./ChSection";
import FadeInUp from "./FadeInUp";

type Step = {
  index: string;
  eyebrow: string;
  title: string;
  body: ReactNode;
  viz: ReactNode;
  primary?: boolean;
};

function VizExecute() {
  return (
    <div className="ch-viz-act">
      <span className="ring" />
      <span className="ring" />
      <span className="ring" />
      <span className="dot" />
    </div>
  );
}

function VizUnderwrite() {
  return (
    <div className="ch-viz-score">
      <svg viewBox="0 0 200 80" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ch-uw-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#5ee1e4" />
            <stop offset="100%" stopColor="#d2f6a2" />
          </linearGradient>
          <linearGradient id="ch-uw-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(134,243,183,0.32)" />
            <stop offset="100%" stopColor="rgba(134,243,183,0)" />
          </linearGradient>
        </defs>
        <path
          className="fill"
          d="M0 80 L0 56 L28 50 L56 58 L86 40 L114 46 L144 26 L172 30 L200 12 L200 80 Z"
          fill="url(#ch-uw-fill)"
        />
        <path
          className="line"
          d="M0 56 L28 50 L56 58 L86 40 L114 46 L144 26 L172 30 L200 12"
          fill="none"
          stroke="url(#ch-uw-line)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle className="tip" cx="200" cy="12" r="3" fill="#d2f6a2" />
      </svg>
    </div>
  );
}

function VizBind() {
  return (
    <div className="ch-viz-bind">
      <svg viewBox="0 0 120 60" fill="none">
        <defs>
          <linearGradient id="ch-bind-grad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#5ee1e4" />
            <stop offset="100%" stopColor="#d2f6a2" />
          </linearGradient>
        </defs>
        <rect
          x="18"
          y="20"
          width="52"
          height="22"
          rx="3"
          fill="rgba(255,255,255,0.05)"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
        />
        <text
          x="44"
          y="35"
          textAnchor="middle"
          fill="rgba(255,255,255,0.6)"
          fontFamily="var(--ch-font-mono)"
          fontSize="9"
          letterSpacing="2"
        >
          tx
        </text>
        <rect className="flash" x="74" y="22" width="32" height="18" rx="9" fill="rgba(134,243,183,0.35)" />
        <g className="tier-pill">
          <rect x="74" y="22" width="32" height="18" rx="9" fill="url(#ch-bind-grad)" />
          <text
            x="90"
            y="35"
            textAnchor="middle"
            fill="#151316"
            fontFamily="var(--ch-font-mono)"
            fontSize="10"
            fontWeight="600"
            letterSpacing="1.5"
          >
            T3
          </text>
        </g>
      </svg>
    </div>
  );
}

function VizEnforce() {
  return (
    <div className="ch-viz-enforce">
      <div className="gate" />
      <div className="pass" />
      <div className="block" />
    </div>
  );
}

const STEPS: Step[] = [
  {
    index: "01",
    eyebrow: "Instruction",
    title: "Execute",
    body: "A user or agent submits an onchain instruction.",
    viz: <VizExecute />,
  },
  {
    index: "02",
    eyebrow: "Index",
    title: "Underwrite",
    body: "The runtime captures every settlement receipt and compounds the outcome into NSI. Quests do not.",
    viz: <VizUnderwrite />,
  },
  {
    index: "03",
    eyebrow: "Tier",
    title: "Bind",
    body: "Runtime attaches tier to every instruction.",
    viz: <VizBind />,
  },
  {
    index: "04",
    eyebrow: "Floor",
    title: "Enforce",
    body: "Above-tier instructions do not execute.",
    viz: <VizEnforce />,
  },
];

export default function DevHomeMechanismSection() {
  return (
    <ChSection>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">03 / Enforcement</span>
        <h2 className="ch-display">
          Standing the <span className="ch-accent-pado">Runtime Enforces</span>
        </h2>
        <p className="ch-lead">
          Standing is not published. It is enforced at runtime, on every native execution.
        </p>
      </FadeInUp>

      <div className="ch-step-grid">
        {STEPS.map((s, i) => (
          <FadeInUp key={s.index} delayMs={120 + i * 90}>
            <article
              className={`ch-step-card${s.primary ? " ch-step-card--primary" : ""}`}
            >
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

      <div className="ch-closing-grid">
        <FadeInUp delayMs={700}>
          <div className="ch-closing-card">
            <span className="ch-closing-eyebrow">What moves NSI</span>
            <h3 className="ch-closing-title">Settlement, not signaling.</h3>
            <p className="ch-body">
              NSI moves on settlement receipts, agent execution records, and verified outcomes.
              Quests do not.
            </p>
          </div>
        </FadeInUp>

        <FadeInUp delayMs={820}>
          <div className="ch-closing-card">
            <span className="ch-closing-eyebrow">How agents inherit</span>
            <h3 className="ch-closing-title">Agents inherit. Then they earn.</h3>
            <p className="ch-body">
              An agent starts with a capped floor inherited from its operator. Its own onchain
              record compounds standing independently, and feeds back.
            </p>
          </div>
        </FadeInUp>
      </div>
    </ChSection>
  );
}
