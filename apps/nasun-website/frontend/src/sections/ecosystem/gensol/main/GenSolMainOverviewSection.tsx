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
  body: string;
};

const PILLARS: Pillar[] = [
  {
    index: "01",
    eyebrow: "Games",
    title: "Playable Worlds",
    body: "Multiplayer shooters and competitive games built in Unreal Engine 5 — every match unfolds inside the canon.",
  },
  {
    index: "02",
    eyebrow: "Animation",
    title: "Cinematic Lore",
    body: "3D animated series and short films expanding the universe with character-driven stories.",
  },
  {
    index: "03",
    eyebrow: "Film",
    title: "Feature Trilogy",
    body: "A planned film trilogy crowned by The V Games, the galaxy-defining competition for the Vertex Zone.",
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

export default function GenSolMainOverviewSection() {
  const gridRef = useGridSpotlight<HTMLDivElement>();
  useRevealReplay(gridRef);
  const tilt = useCardTilt();

  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">02 / Overview</span>
        <h2 className="ch-display">
          A universe built for <span className="gs-accent">stories that travel</span>
        </h2>
        <p className="ch-lead">
          Gen Sol is a sci-fi setting where Spectra — the galaxy's most coveted
          fuel — drives empires, outlaws, and the games they play. Every story,
          across animation, live-action, games, and films, takes place inside
          the same canon. Striking visuals, characters with real stakes, and a
          world the audience can both watch and inhabit.
        </p>
      </FadeInUp>

      <div ref={gridRef} className="ch-step-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {PILLARS.map((p) => (
          <FadeInUp key={p.index}>
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
