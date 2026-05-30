import { useCallback } from "react";
import type { PointerEvent as RPointerEvent } from "react";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import { useGridSpotlight } from "@/sections/dev/_shared/useGridSpotlight";
import { useRevealReplay } from "@/sections/dev/_shared/useRevealReplay";

type Pillar = {
  index: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  body: string;
};

const PILLARS: Pillar[] = [
  {
    index: "01",
    eyebrow: "Fringes",
    title: "The Fringes",
    subtitle: "Animation series + Multiplayer shooter",
    body: "Outlaws, mercenaries, and anti-heroes fighting for survival on the galaxy's edge.",
  },
  {
    index: "02",
    eyebrow: "Politics",
    title: "The Politics",
    subtitle: "Live-action series + Tournament games",
    body: "Empires, heirs, and power brokers scheming for dominance.",
  },
  {
    index: "03",
    eyebrow: "V Games",
    title: "The V Games",
    subtitle: "Feature film trilogy + Flagship game",
    body: "The galaxy-defining competition for control of the Vertex Zone — the source of all Spectra.",
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

export default function PlanStructureSection() {
  const gridRef = useGridSpotlight<HTMLDivElement>();
  useRevealReplay(gridRef);
  const tilt = useCardTilt();

  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-3 items-start text-left">
        <span className="ch-eyebrow">01 / The Structure</span>
        <h2 className="ch-display">
          Three story arcs, <span className="gs-accent">one canon</span>
        </h2>
      </FadeInUp>

      <div ref={gridRef} className="ch-step-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {PILLARS.map((p) => (
          <FadeInUp key={p.index}>
            <article
              className="ch-step-card gs-card-noviz"
              data-spotlight-card=""
              onPointerMove={tilt.onMove}
              onPointerLeave={tilt.onLeave}
            >
              <span className="ch-step-card-halo" aria-hidden="true" />
              <span className="ch-step-card-glow" aria-hidden="true" />
              <header className="ch-step-card-header">
                <span className="ch-step-card-eyebrow">{p.eyebrow}</span>
                <span className="ch-step-card-num">{p.index}</span>
              </header>
              <h3 className="ch-step-card-title">{p.title}</h3>
              <p
                style={{
                  fontFamily: "var(--ch-font-mono)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--ch-fg-subdued)",
                  margin: "0.2rem 0 0.6rem",
                }}
              >
                {p.subtitle}
              </p>
              <p className="ch-step-card-body">{p.body}</p>
            </article>
          </FadeInUp>
        ))}
      </div>
    </ChSection>
  );
}
