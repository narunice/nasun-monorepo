import type { ReactNode, PointerEvent as RPointerEvent } from "react";
import { useCallback, useRef } from "react";
import ChSection from "../home/ChSection";
import FadeInUp from "../home/FadeInUp";
import { useGridSpotlight } from "../_shared/useGridSpotlight";
import { useRevealReplay } from "../_shared/useRevealReplay";

type Pillar = {
  index: string;
  title: string;
  body: string;
  viz: ReactNode;
};

/* ------------------------------------------------------------------ */
/* Vizes — replacement set (2026 modern)                              */
/* Idle = static glyph; hover triggers a single reveal cycle via      */
/* data-state on the card. Each viz uses CSS-only transforms.         */
/* ------------------------------------------------------------------ */

function VizStackedLayers() {
  return (
    <div className="ch-gv-viz ch-gv-viz-layers">
      <span className="layer l1" />
      <span className="layer l2" />
      <span className="layer l3" />
      <span className="layer-grain" />
    </div>
  );
}

function VizLuminanceBands() {
  return (
    <div className="ch-gv-viz ch-gv-viz-bands">
      <span className="band b1" />
      <span className="band b2" />
      <span className="band b3" />
      <span className="band b4" />
      <span className="band-tick" />
    </div>
  );
}

function VizHoloMerge() {
  return (
    <div className="ch-gv-viz ch-gv-viz-holo">
      <span className="chip c1">E</span>
      <span className="chip c2">S</span>
      <span className="chip c3">S</span>
      <span className="link k1" />
      <span className="link k2" />
      <span className="link k3" />
      <span className="node">
        <span className="node-core" />
        <span className="node-halo" />
      </span>
    </div>
  );
}

function VizResonance() {
  return (
    <div className="ch-gv-viz ch-gv-viz-resonance">
      <span className="ring r1" />
      <span className="ring r2" />
      <span className="ring r3" />
      <span className="core" />
    </div>
  );
}

const PILLARS: Pillar[] = [
  {
    index: "01",
    title: "Compounding Track Records",
    body:
      "Users and agents build independent execution histories that both compound into a shared standing over time. The more meaningful activity in the environment, the more authority accrues.",
    viz: <VizStackedLayers />,
  },
  {
    index: "02",
    title: "Real Benefits at Higher Tiers",
    body:
      "A higher Nasun Standing Index unlocks real economic benefits: lower fees, higher leverage limits, expanded agent permissions, priority execution, and increased staking rewards.",
    viz: <VizLuminanceBands />,
  },
  {
    index: "03",
    title: "Bring Your History With You",
    body:
      "Import verified activity from Ethereum, Solana, and Sui and start on Nasun with established standing. You do not arrive at zero.",
    viz: <VizHoloMerge />,
  },
  {
    index: "04",
    title: "One Record, Across Chains",
    body:
      "Engage curated applications across chains while building one unified Nasun Standing Index. External applications gain participants with persistent behavioral history rather than isolated wallets.",
    viz: <VizResonance />,
  },
];

/* Per-card tilt: read pointer position, write CSS vars on the card. */
function useCardTilt() {
  const onMove = useCallback((e: RPointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width; // 0..1
    const y = (e.clientY - rect.top) / rect.height; // 0..1
    const rx = (0.5 - y) * 4; // ±2deg
    const ry = (x - 0.5) * 4;
    el.style.setProperty("--rx", `${rx}deg`);
    el.style.setProperty("--ry", `${ry}deg`);
  }, []);
  const onLeave = useCallback((e: RPointerEvent<HTMLElement>) => {
    e.currentTarget.style.setProperty("--rx", "0deg");
    e.currentTarget.style.setProperty("--ry", "0deg");
  }, []);
  return { onMove, onLeave };
}

export default function DevAboutGravitySection() {
  const gridRef = useGridSpotlight<HTMLDivElement>();
  useRevealReplay(gridRef);
  const tilt = useCardTilt();
  const lastTap = useRef(0);

  // On mobile (no hover), tap toggles a one-shot replay via data-state.
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

      <div ref={gridRef} className="ch-gravity-grid">
        {PILLARS.map((p, i) => (
          <FadeInUp key={p.index} delayMs={120 + i * 100}>
            <article
              className="ch-gravity-card"
              data-spotlight-card=""
              data-state="idle"
              onPointerMove={tilt.onMove}
              onPointerLeave={tilt.onLeave}
              onPointerDown={onCardPointerDown}
            >
              <span className="ch-gravity-card-halo" aria-hidden="true" />
              <span className="ch-gravity-card-glow" aria-hidden="true" />
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
