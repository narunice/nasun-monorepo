import { useCallback } from "react";
import type { PointerEvent as RPointerEvent, ReactNode } from "react";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import { useGridSpotlight } from "@/sections/dev/_shared/useGridSpotlight";
import { useRevealReplay } from "@/sections/dev/_shared/useRevealReplay";

/* Reuse the catena vizes (.ch-viz-act/score/bind/enforce). Stroke colors are
   re-themed via gensol-theme.css overrides + the §4.3.e CSS variables on the
   inline SVG stops, so no bespoke viz markup needed here. */

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
          <linearGradient id="gs-uw-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--ch-viz-stop-start, #d52933)" />
            <stop offset="100%" stopColor="var(--ch-viz-stop-end, #ffb547)" />
          </linearGradient>
          <linearGradient id="gs-uw-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--ch-viz-fill-strong, rgba(213,41,51,0.32))" />
            <stop offset="100%" stopColor="var(--ch-viz-fill-fade, rgba(213,41,51,0))" />
          </linearGradient>
        </defs>
        <path
          className="fill"
          d="M0 80 L0 56 L28 50 L56 58 L86 40 L114 46 L144 26 L172 30 L200 12 L200 80 Z"
          fill="url(#gs-uw-fill)"
        />
        <path
          className="line"
          d="M0 56 L28 50 L56 58 L86 40 L114 46 L144 26 L172 30 L200 12"
          fill="none"
          stroke="url(#gs-uw-line)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle className="tip" cx="200" cy="12" r="3" fill="#ffb547" />
      </svg>
    </div>
  );
}

function VizBind() {
  return (
    <div className="ch-viz-bind">
      <svg viewBox="0 0 120 60" fill="none">
        <defs>
          <linearGradient id="gs-bind-grad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--ch-viz-pill-start, #d52933)" />
            <stop offset="100%" stopColor="var(--ch-viz-pill-end, #ffb547)" />
          </linearGradient>
        </defs>
        <rect
          x="18"
          y="20"
          width="44"
          height="22"
          rx="3"
          fill="rgba(255,255,255,0.05)"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
        />
        <text
          x="40"
          y="35"
          textAnchor="middle"
          fill="rgba(255,255,255,0.6)"
          fontFamily="var(--ch-font-mono)"
          fontSize="9"
          letterSpacing="1"
        >
          ext
        </text>
        <rect
          className="flash"
          x="66"
          y="22"
          width="48"
          height="18"
          rx="9"
          fill="rgba(213,41,51,0.35)"
        />
        <g className="tier-pill">
          <rect
            x="66"
            y="22"
            width="48"
            height="18"
            rx="9"
            fill="url(#gs-bind-grad)"
          />
          <text
            x="90"
            y="35"
            textAnchor="middle"
            fill="#111821"
            fontFamily="var(--ch-font-mono)"
            fontSize="10"
            fontWeight="600"
            letterSpacing="0.5"
          >
            Loot
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

type Step = {
  index: string;
  eyebrow: string;
  title: string;
  body: string;
  viz: ReactNode;
};

const STEPS: Step[] = [
  {
    index: "01",
    eyebrow: "Crash",
    title: "Make landfall",
    body: "Your team crash-lands on a hostile alien world. Spectra is scattered across the wreckage.",
    viz: <VizExecute />,
  },
  {
    index: "02",
    eyebrow: "Extract",
    title: "Pull Spectra",
    body: "Race to extract enough Spectra to power your escape ship. Carry more, earn more — but slow yourself down.",
    viz: <VizUnderwrite />,
  },
  {
    index: "03",
    eyebrow: "Compete",
    title: "Outgun the enemy",
    body: "Two factions, one wreck. Combat, timing, and risk management decide who fuels the way out.",
    viz: <VizBind />,
  },
  {
    index: "04",
    eyebrow: "Escape",
    title: "Survive or burn",
    body: "Lava eruptions intensify. Earthquakes carve the map. Delay too long and the planet kills everyone.",
    viz: <VizEnforce />,
  },
];

function useCardTilt() {
  const onMove = useCallback((e: RPointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    el.style.setProperty("--rx", `${(0.5 - y) * 4}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 4}deg`);
  }, []);
  const onLeave = useCallback((e: RPointerEvent<HTMLElement>) => {
    e.currentTarget.style.setProperty("--rx", "0deg");
    e.currentTarget.style.setProperty("--ry", "0deg");
  }, []);
  return { onMove, onLeave };
}

export default function SpectraCoreLoopSection() {
  const gridRef = useGridSpotlight<HTMLDivElement>();
  useRevealReplay(gridRef);
  const tilt = useCardTilt();

  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">02 / The Core Loop</span>
        <h2 className="ch-display">
          Crash. Compete. <span className="gs-accent">Escape or perish.</span>
        </h2>
      </FadeInUp>

      <div ref={gridRef} className="ch-step-grid">
        {STEPS.map((s) => (
          <FadeInUp key={s.index}>
            <article
              className="ch-step-card"
              data-spotlight-card=""
              data-state="idle"
              onPointerMove={tilt.onMove}
              onPointerLeave={tilt.onLeave}
            >
              <span className="ch-step-card-halo" aria-hidden="true" />
              <span className="ch-step-card-glow" aria-hidden="true" />
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
    </ChSection>
  );
}
