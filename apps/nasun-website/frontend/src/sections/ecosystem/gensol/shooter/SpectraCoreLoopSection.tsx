import { useCallback } from "react";
import type { PointerEvent as RPointerEvent } from "react";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import { useGridSpotlight } from "@/sections/dev/_shared/useGridSpotlight";
import { useRevealReplay } from "@/sections/dev/_shared/useRevealReplay";

type Step = {
  index: string;
  eyebrow: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    index: "01",
    eyebrow: "Crash",
    title: "Make landfall",
    body: "Your team crash-lands on a hostile alien world. Spectra is scattered across the wreckage.",
  },
  {
    index: "02",
    eyebrow: "Extract",
    title: "Pull Spectra",
    body: "Race to extract enough Spectra to power your escape ship. Carry more, earn more, but slow yourself down.",
  },
  {
    index: "03",
    eyebrow: "Compete",
    title: "Outgun the enemy",
    body: "Two factions, one wreck. Combat, timing, and risk management decide who fuels the way out.",
  },
  {
    index: "04",
    eyebrow: "Escape",
    title: "Survive or burn",
    body: "Lava eruptions intensify. Earthquakes carve the map. Delay too long and the planet kills everyone.",
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
              className="ch-step-card gs-card-noviz"
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
            </article>
          </FadeInUp>
        ))}
      </div>
    </ChSection>
  );
}
