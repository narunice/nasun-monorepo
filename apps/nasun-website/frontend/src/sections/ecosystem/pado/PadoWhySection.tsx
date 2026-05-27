import type { PointerEvent as RPointerEvent } from "react";
import { useCallback } from "react";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import { useGridSpotlight } from "@/sections/dev/_shared/useGridSpotlight";

const POINTS = [
  {
    index: "01",
    eyebrow: "Reset",
    title: "Standing resets at every venue",
    body: "A trader with five years of disciplined execution shows up to a new app as an empty wallet. There is no portable record of who has actually been right.",
  },
  {
    index: "02",
    eyebrow: "Agents",
    title: "Agents transact, but cannot earn trust",
    body: "AI agents can place orders, but no venue can tell a careful operator's agent from a freshly minted bot. Permissions stay coarse, leverage stays defensive.",
  },
  {
    index: "03",
    eyebrow: "Custody",
    title: "Capital lives in silos",
    body: "Spot, perps, prediction, and lending each hold separate margin and custody. Bridging dilutes safety and the same dollar cannot back two products.",
  },
  {
    index: "04",
    eyebrow: "Signal",
    title: "Reputation is unenforced",
    body: "Reputation scores get published; applications choose whether to honor them. Feedback-based systems are easy to game and disconnected from real capital behavior.",
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

export default function PadoWhySection() {
  const gridRef = useGridSpotlight<HTMLDivElement>();
  const tilt = useCardTilt();

  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">01 / The Problem</span>
        <h2 className="ch-display">
          Agentic finance has the same gap{" "}
          <span className="pd-accent">at every venue</span>.
        </h2>
        <p className="ch-lead">
          People and agents can transact, but their financial standing does
          not follow them. Pado is built so the act of trading is the act of
          earning that standing.
        </p>
      </FadeInUp>

      <div ref={gridRef} className="ch-step-grid">
        {POINTS.map((p, i) => (
          <FadeInUp key={p.index} delayMs={120 + i * 90}>
            <article
              className="ch-step-card"
              data-spotlight-card=""
              onPointerMove={tilt.onMove}
              onPointerLeave={tilt.onLeave}
              style={{ minHeight: 240 }}
            >
              <span className="ch-step-card-halo" aria-hidden="true" />
              <span className="ch-step-card-glow" aria-hidden="true" />
              <header className="ch-step-card-header">
                <span className="ch-step-card-eyebrow">{p.eyebrow}</span>
                <span className="ch-step-card-num">{p.index}</span>
              </header>
              <h3 className="ch-step-card-title">{p.title}</h3>
              <p className="ch-step-card-body">{p.body}</p>
            </article>
          </FadeInUp>
        ))}
      </div>
    </ChSection>
  );
}
