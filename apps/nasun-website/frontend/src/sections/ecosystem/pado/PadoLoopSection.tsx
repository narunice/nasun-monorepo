import type { PointerEvent as RPointerEvent } from "react";
import { useCallback } from "react";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import { useGridSpotlight } from "@/sections/dev/_shared/useGridSpotlight";

const STEPS = [
  {
    index: "01",
    eyebrow: "Act",
    title: "Trade or delegate",
    body: "A user or an agent submits an order on Pado. Spot, perp, prediction, or lending action, the entry point is the same.",
  },
  {
    index: "02",
    eyebrow: "Record",
    title: "Settle as a receipt",
    body: "Execution lands onchain as a structured receipt: filled price, size, PnL, venue, signer, agent identity if any.",
  },
  {
    index: "03",
    eyebrow: "Score",
    title: "Update NSI",
    body: "The runtime captures every receipt and compounds the risk-adjusted outcome into the Nasun Standing Index for both the operator and the agent.",
  },
  {
    index: "04",
    eyebrow: "Enforce",
    title: "Resolve into tier",
    body: "NSI resolves to an authority tier. Tier sets capital limits, leverage floors, agent permissions, and execution priority across the venue.",
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
  const tilt = useCardTilt();

  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">03 / Compounding loop</span>
        <h2 className="ch-display">
          Trading on Pado{" "}
          <span className="pd-accent">is how standing is earned</span>.
        </h2>
        <p className="ch-lead">
          Pado is a native Nasun app: tier checks are embedded in execution,
          not bolted on. The loop runs on every fill, for every operator and
          every agent.
        </p>
      </FadeInUp>

      <div ref={gridRef} className="ch-step-grid">
        {STEPS.map((s, i) => (
          <FadeInUp key={s.index} delayMs={120 + i * 90}>
            <article
              className="ch-step-card"
              data-spotlight-card=""
              onPointerMove={tilt.onMove}
              onPointerLeave={tilt.onLeave}
              style={{ minHeight: 260 }}
            >
              <span className="ch-step-card-halo" aria-hidden="true" />
              <span className="ch-step-card-glow" aria-hidden="true" />
              <header className="ch-step-card-header">
                <span className="ch-step-card-eyebrow">{s.eyebrow}</span>
                <span className="ch-step-card-num">{s.index}</span>
              </header>
              <h3 className="ch-step-card-title">{s.title}</h3>
              <p className="ch-step-card-body">{s.body}</p>
            </article>
          </FadeInUp>
        ))}
      </div>

      <div className="ch-closing-grid">
        <FadeInUp delayMs={620}>
          <div className="ch-closing-card">
            <span className="ch-closing-eyebrow">What moves NSI</span>
            <h3 className="ch-closing-title">Settled outcomes, not signaling.</h3>
            <p className="ch-body">
              NSI moves on execution receipts. Quests, follows, and posted
              opinions do not.
            </p>
          </div>
        </FadeInUp>

        <FadeInUp delayMs={760}>
          <div className="ch-closing-card">
            <span className="ch-closing-eyebrow">How agents inherit</span>
            <h3 className="ch-closing-title">Inherit. Then earn.</h3>
            <p className="ch-body">
              An agent starts with a capped floor from its operator. Its own
              receipts compound an independent record that feeds back into the
              operator's standing.
            </p>
          </div>
        </FadeInUp>
      </div>
    </ChSection>
  );
}
