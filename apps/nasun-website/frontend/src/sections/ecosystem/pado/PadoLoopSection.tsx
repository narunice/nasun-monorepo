import type { PointerEvent as RPointerEvent, ReactNode } from "react";
import { useCallback, useRef } from "react";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import { useGridSpotlight } from "@/sections/dev/_shared/useGridSpotlight";
import { useRevealReplay } from "@/sections/dev/_shared/useRevealReplay";

/* ------------------------------------------------------------------ */
/* Vizes — Pado-only primitives, distinct from the home Mechanism set */
/* (`ch-viz-*`, also rendered on /about) and the About Gravity set    */
/* (`ch-gv-viz-*`). Animation timing + colors live in pado-theme.css; */
/* the JSX is just the markup the keyframes target.                   */
/* ------------------------------------------------------------------ */

function VizAct() {
  // Two distinct trade paths into Pado:
  //   1. Direct  — human → Pado (a light point travels straight)
  //   2. Delegated — human → robot → Pado (light point hops through
  //      the agent before reaching Pado, the agent-as-vault-manager
  //      roadmap direction)
  //
  // Both packets start from the same junction at the human side (x=32),
  // so the delegate path reuses the same handoff point as the direct
  // path. The delegate line is now a real channel a packet rides on,
  // not just a decorative arrow.
  return (
    <div className="pd-viz-act">
      <svg viewBox="0 0 180 80" fill="none" aria-hidden="true">
        {/* Human silhouette — head circle + curved shoulders. Control
            point y=16 puts the shoulder curve's peak (at t=0.5) at y=23,
            just below the head's bottom edge (y=22.8), closing the
            visual gap between head and body. */}
        <g>
          <circle cx="22" cy="19" r="3.8" fill="#60a5fa" />
          <path
            d="M 14 30 Q 22 16 30 30 L 30 32 Q 22 30.5 14 32 Z"
            fill="#60a5fa"
          />
        </g>

        {/* Agent glyph — chip-like rectangle with two eyes */}
        <g>
          <rect
            x="13"
            y="48"
            width="18"
            height="14"
            rx="2.5"
            fill="rgba(96,165,250,0.18)"
            stroke="#60a5fa"
            strokeWidth="1.4"
          />
          <circle cx="18" cy="54" r="1.4" fill="#60a5fa" />
          <circle cx="26" cy="54" r="1.4" fill="#60a5fa" />
          <line
            x1="18"
            y1="58.5"
            x2="26"
            y2="58.5"
            stroke="#60a5fa"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>

        {/* Direct trade line — starts at the human's right edge so it
            doesn't share a junction with the delegate channel. */}
        <line
          x1="30"
          y1="27"
          x2="134"
          y2="40"
          stroke="rgba(96,165,250,0.32)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />

        {/* Delegate channel — quadratic curve bowing LEFT, away from
            the trade lines. Starts at the human's bottom-center and
            ends at the agent's top-center, so it doesn't tangle with
            either trade line into Pado. */}
        <path
          className="delegate"
          d="M 22 32 Q 6 40 22 48"
          stroke="rgba(147,197,253,0.5)"
          strokeWidth="1.3"
          strokeLinecap="round"
          fill="none"
        />

        {/* Delegated execution line — starts at the agent's right edge */}
        <line
          x1="31"
          y1="55"
          x2="134"
          y2="40"
          stroke="rgba(96,165,250,0.32)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />

        {/* Platform — Pado circle holding the official Nasun symbol
            (downward triangle, ~1.155:1 wider than tall). */}
        <circle
          className="platform"
          cx="146"
          cy="40"
          r="13"
          fill="rgba(96,165,250,0.18)"
          stroke="#60a5fa"
          strokeWidth="1.8"
        />
        <polygon points="139,35 153,35 146,47" fill="#bfdbfe" />

        {/* Packets — direct starts at the human's right edge and goes
            straight to Pado; delegate starts at the human's bottom-
            center, rides the left-bowing channel down to the agent,
            then slides into the agent's trade line into Pado. */}
        <circle
          className="pkt pkt-direct"
          cx="30"
          cy="27"
          r="2.4"
          fill="#ffffff"
        />
        {/* Delegate packet — positioned by CSS offset-path so it follows
            the curve smoothly. cx/cy set to 0 so the offset-path-driven
            position is absolute in SVG user space. */}
        <circle
          className="pkt pkt-delegate"
          cx="0"
          cy="0"
          r="2.4"
          fill="#ffffff"
        />
      </svg>
    </div>
  );
}

function VizRecord() {
  // "Onchain record" — a small block frame holds three data lines that
  // draw left → right via SVG stroke-dashoffset (more reliable across
  // browsers than CSS transform on absolute-positioned spans). The
  // pathLength="1" trick normalizes each line to a 0–1 dash range so a
  // single keyframe drives all three.
  return (
    <div className="pd-viz-record">
      <svg viewBox="0 0 120 80" fill="none" aria-hidden="true">
        <rect
          x="22"
          y="14"
          width="76"
          height="52"
          rx="3"
          fill="rgba(96,165,250,0.08)"
          stroke="rgba(96,165,250,0.4)"
          strokeWidth="1.3"
        />
        {/* Solid stroke (not a gradient) — horizontal <line> has a
            degenerate BBox so `url(#…)` objectBoundingBox gradients
            don't render the stroke in some browsers. */}
        <line
          className="line l1"
          x1="32"
          y1="26"
          x2="88"
          y2="26"
          stroke="#60a5fa"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <line
          className="line l2"
          x1="32"
          y1="40"
          x2="76"
          y2="40"
          stroke="#60a5fa"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <line
          className="line l3"
          x1="32"
          y1="54"
          x2="64"
          y2="54"
          stroke="#60a5fa"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function VizScore() {
  // Hexagonal NSI badge — stroke draws around, label flashes.
  return (
    <div className="pd-viz-score">
      <svg viewBox="0 0 100 100" fill="none">
        <defs>
          <linearGradient id="pd-score-stroke" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#bfdbfe" />
          </linearGradient>
        </defs>
        <polygon
          className="hex"
          points="50,12 84,32 84,68 50,88 16,68 16,32"
          stroke="url(#pd-score-stroke)"
          strokeWidth="2"
          fill="rgba(96,165,250,0.08)"
          strokeLinejoin="round"
        />
        <text
          className="label"
          x="50"
          y="56"
          textAnchor="middle"
          fill="#93c5fd"
          fontFamily="var(--ch-font-mono)"
          fontSize="16"
          fontWeight="600"
          letterSpacing="0.5"
        >
          NSI
        </text>
      </svg>
    </div>
  );
}

function VizEnforce() {
  // Padlock: shackle pivots around the left leg's bottom hinge — lifts
  // straight up, then swings the right side out, holds the open pose,
  // and snaps closed with a small overshoot. ViewBox is taller than
  // before so the swing has headroom without getting clipped.
  return (
    <div className="pd-viz-enforce">
      <svg viewBox="0 0 44 60" fill="none">
        <path
          className="shackle"
          d="M 13 30 V 23 a 9 9 0 0 1 18 0 V 30"
          stroke="#93c5fd"
          strokeWidth="2.6"
          strokeLinecap="butt"
          fill="none"
        />
        <rect
          className="body"
          x="8"
          y="30"
          width="28"
          height="22"
          rx="3"
          fill="rgba(96,165,250,0.16)"
          stroke="#3b82f6"
          strokeWidth="2"
        />
        <circle cx="22" cy="39" r="2.6" fill="#93c5fd" />
        <rect x="20.7" y="39" width="2.6" height="7" rx="1" fill="#93c5fd" />
      </svg>
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
    eyebrow: "Act",
    title: "Trade or delegate",
    body: "A user or an agent submits an order on Pado. Spot, perp, prediction, or lending action, the entry point is the same.",
    viz: <VizAct />,
  },
  {
    index: "02",
    eyebrow: "Record",
    title: "Onchain record",
    body: "Execution lands onchain as a structured record. Price, size, PnL, venue, signer, and agent identity all captured.",
    viz: <VizRecord />,
  },
  {
    index: "03",
    eyebrow: "Score",
    title: "Update NSI",
    body: "The risk-adjusted outcome compounds into NSI for the user, and the agent if one placed it.",
    viz: <VizScore />,
  },
  {
    index: "04",
    eyebrow: "Enforce",
    title: "Resolve into tier",
    body: "NSI resolves to an authority tier. Tier sets capital limits, leverage floors, agent permissions, and execution priority across the venue.",
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

export default function PadoLoopSection() {
  const gridRef = useGridSpotlight<HTMLDivElement>();
  useRevealReplay(gridRef);
  const tilt = useCardTilt();
  const lastTap = useRef(0);

  const onCardPointerDown = useCallback((e: RPointerEvent<HTMLElement>) => {
    if (e.pointerType !== "touch") return;
    const now = performance.now();
    if (now - lastTap.current < 400) return;
    lastTap.current = now;
    const el = e.currentTarget;
    el.dataset.state = "playing";
    window.setTimeout(() => {
      el.dataset.state = "done";
    }, 900);
  }, []);

  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">03 / Compounding loop</span>
        <h2 className="ch-display">
          How <span className="pd-accent">standing</span> compounds.
        </h2>
        <p className="ch-lead">
          Tier checks live inside execution, not bolted on. The loop runs on
          every fill, for every user and every agent.
        </p>
      </FadeInUp>

      <div ref={gridRef} className="ch-step-grid">
        {STEPS.map((s, i) => (
          <FadeInUp key={s.index} delayMs={120 + i * 90}>
            <article
              className="ch-step-card"
              data-spotlight-card=""
              data-state="idle"
              onPointerMove={tilt.onMove}
              onPointerLeave={tilt.onLeave}
              onPointerDown={onCardPointerDown}
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
