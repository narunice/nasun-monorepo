import type { ReactNode } from "react";
import ChSection from "../home/ChSection";
import FadeInUp from "../home/FadeInUp";

type Pillar = {
  index: string;
  title: string;
  body: string;
  viz: ReactNode;
};

function VizCompound() {
  return (
    <div className="ch-gv-viz ch-gv-viz-compound">
      <svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="gv-bar-grad" x1="0" x2="0" y1="1" y2="0">
            <stop offset="0%" stopColor="rgba(94,225,228,0.05)" />
            <stop offset="100%" stopColor="rgba(94,225,228,0.55)" />
          </linearGradient>
          <linearGradient id="gv-line-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#5ee1e4" />
            <stop offset="100%" stopColor="#d2f6a2" />
          </linearGradient>
        </defs>
        <g className="bars">
          <rect className="b b1" x="14" y="56" width="14" height="20" rx="2" fill="url(#gv-bar-grad)" />
          <rect className="b b2" x="40" y="46" width="14" height="30" rx="2" fill="url(#gv-bar-grad)" />
          <rect className="b b3" x="66" y="34" width="14" height="42" rx="2" fill="url(#gv-bar-grad)" />
          <rect className="b b4" x="92" y="22" width="14" height="54" rx="2" fill="url(#gv-bar-grad)" />
          <rect className="b b5" x="118" y="10" width="14" height="66" rx="2" fill="url(#gv-bar-grad)" />
        </g>
        <path
          className="line"
          d="M21 56 L47 46 L73 34 L99 22 L125 10"
          fill="none"
          stroke="url(#gv-line-grad)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle className="tip" cx="125" cy="10" r="2.6" fill="#d2f6a2" />
      </svg>
    </div>
  );
}

function VizTiers() {
  return (
    <div className="ch-gv-viz ch-gv-viz-tiers">
      <svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="gv-tier-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#5ee1e4" />
            <stop offset="100%" stopColor="#d2f6a2" />
          </linearGradient>
        </defs>
        {/* tier rails */}
        <g className="rails" stroke="rgba(255,255,255,0.08)" strokeWidth="1">
          <line x1="14" y1="60" x2="146" y2="60" />
          <line x1="14" y1="42" x2="146" y2="42" />
          <line x1="14" y1="24" x2="146" y2="24" />
        </g>
        {/* tier pills (centered on arrow axis, growing width upward) */}
        <g className="pills">
          <rect className="p p1" x="65" y="54" width="30" height="12" rx="6" fill="rgba(94,225,228,0.18)" stroke="rgba(94,225,228,0.45)" />
          <rect className="p p2" x="62" y="36" width="36" height="12" rx="6" fill="rgba(94,225,228,0.28)" stroke="rgba(134,243,183,0.55)" />
          <rect className="p p3" x="58" y="18" width="44" height="12" rx="6" fill="url(#gv-tier-grad)" />
        </g>
        {/* arrow up — runs through the center of every pill */}
        <g className="arrow" stroke="rgba(134,243,183,0.7)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <line x1="80" y1="74" x2="80" y2="10" />
          <polyline points="74 16 80 10 86 16" />
        </g>
      </svg>
    </div>
  );
}

function VizImport() {
  return (
    <div className="ch-gv-viz ch-gv-viz-import">
      <svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="gv-flow" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="rgba(94,225,228,0)" />
            <stop offset="50%" stopColor="rgba(94,225,228,0.85)" />
            <stop offset="100%" stopColor="rgba(210,246,162,0)" />
          </linearGradient>
        </defs>
        {/* source chain nodes */}
        <g className="sources">
          <g className="src s1">
            <circle cx="20" cy="20" r="5" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.35)" />
            <text x="20" y="23" textAnchor="middle" fontSize="6" fontFamily="var(--ch-font-mono)" fill="rgba(255,255,255,0.7)">E</text>
          </g>
          <g className="src s2">
            <circle cx="20" cy="40" r="5" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.35)" />
            <text x="20" y="43" textAnchor="middle" fontSize="6" fontFamily="var(--ch-font-mono)" fill="rgba(255,255,255,0.7)">S</text>
          </g>
          <g className="src s3">
            <circle cx="20" cy="60" r="5" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.35)" />
            <text x="20" y="63" textAnchor="middle" fontSize="6" fontFamily="var(--ch-font-mono)" fill="rgba(255,255,255,0.7)">S</text>
          </g>
        </g>
        {/* flow paths */}
        <g className="paths" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1">
          <path d="M26 20 C 70 20, 90 40, 134 40" />
          <path d="M26 40 L 134 40" />
          <path d="M26 60 C 70 60, 90 40, 134 40" />
        </g>
        {/* animated dashes */}
        <g className="dashes" fill="none" stroke="url(#gv-flow)" strokeWidth="1.4" strokeLinecap="round">
          <path className="d d1" d="M26 20 C 70 20, 90 40, 134 40" />
          <path className="d d2" d="M26 40 L 134 40" />
          <path className="d d3" d="M26 60 C 70 60, 90 40, 134 40" />
        </g>
        {/* target node */}
        <g className="target">
          <circle cx="140" cy="40" r="9" fill="rgba(134,243,183,0.12)" stroke="rgba(134,243,183,0.65)" />
          <circle cx="140" cy="40" r="3" fill="#86f3b7" />
        </g>
      </svg>
    </div>
  );
}

function VizOrbit() {
  return (
    <div className="ch-gv-viz ch-gv-viz-orbit">
      <svg viewBox="0 0 160 80" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <radialGradient id="gv-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d2f6a2" />
            <stop offset="100%" stopColor="#5ee1e4" />
          </radialGradient>
        </defs>
        {/* orbit rings */}
        <g className="orbits" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1">
          <ellipse className="o o1" cx="80" cy="40" rx="36" ry="14" />
          <ellipse className="o o2" cx="80" cy="40" rx="56" ry="22" transform="rotate(20 80 40)" />
          <ellipse className="o o3" cx="80" cy="40" rx="70" ry="30" transform="rotate(-15 80 40)" />
        </g>
        {/* satellites */}
        <g className="sats">
          <circle className="sat sa1" cx="116" cy="40" r="2.4" fill="rgba(94,225,228,0.95)" />
          <circle className="sat sa2" cx="44" cy="40" r="2" fill="rgba(210,246,162,0.9)" />
          <circle className="sat sa3" cx="80" cy="62" r="2.2" fill="rgba(255,255,255,0.85)" />
        </g>
        {/* core */}
        <circle className="core" cx="80" cy="40" r="7" fill="url(#gv-core)" />
        <circle className="core-glow" cx="80" cy="40" r="11" fill="none" stroke="rgba(134,243,183,0.3)" />
      </svg>
    </div>
  );
}

const PILLARS: Pillar[] = [
  {
    index: "01",
    title: "Compounding Track Records",
    body:
      "Users and agents build independent execution histories that both compound into a shared standing over time. The more meaningful activity in the environment, the more authority accrues.",
    viz: <VizCompound />,
  },
  {
    index: "02",
    title: "Real Benefits at Higher Tiers",
    body:
      "A higher Nasun Standing Index unlocks real economic benefits: lower fees, higher leverage limits, expanded agent permissions, priority execution, and increased staking rewards.",
    viz: <VizTiers />,
  },
  {
    index: "03",
    title: "Bring Your History With You",
    body:
      "Import verified activity from Ethereum, Solana, and Sui and start on Nasun with established standing. You do not arrive at zero.",
    viz: <VizImport />,
  },
  {
    index: "04",
    title: "One Record, Across Chains",
    body:
      "Engage curated applications across chains while building one unified Nasun Standing Index. External applications gain participants with persistent behavioral history rather than isolated wallets.",
    viz: <VizOrbit />,
  },
];

export default function DevAboutGravitySection() {
  return (
    <ChSection innerClassName="ch-about-gravity">
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">01 / Gravity</span>
        <h2 className="ch-display" style={{ maxWidth: "940px" }}>
          Becoming the Center of{" "}
          <span className="ch-accent-pado">Onchain Financial Gravity</span>
        </h2>
        <p className="ch-body" style={{ maxWidth: "780px" }}>
          The runtime enforces the financial authority you have earned. Every
          action compounds and makes Nasun the natural place for onchain
          financial activity to gather.
        </p>
      </FadeInUp>

      <div className="ch-gravity-grid">
        {PILLARS.map((p, i) => (
          <FadeInUp key={p.index} delayMs={120 + i * 100}>
            <article className="ch-gravity-card">
              <div className="ch-gravity-card-viz">{p.viz}</div>
              <div className="ch-gravity-card-head">
                <span className="ch-gravity-card-num">{p.index}</span>
                <h3 className="ch-gravity-card-title">{p.title}</h3>
              </div>
              <p className="ch-body ch-gravity-card-body">{p.body}</p>
            </article>
          </FadeInUp>
        ))}
      </div>
    </ChSection>
  );
}
