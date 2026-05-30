import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import { useGridSpotlight } from "@/sections/dev/_shared/useGridSpotlight";

type Character = {
  name: string;
  body: string;
};

const CHARACTERS: Character[] = [
  {
    name: "Josen",
    body: "A farmer scarred by loss. His wife's death left him paralyzed by fear — fear that has quietly fractured his relationship with Naro. Thrust into a violent underworld, he must confront who he was and what he's willing to become.",
  },
  {
    name: "Naro",
    body: "Intelligent, resilient, mature beyond her years. She dreams of traveling the stars with her father, even as she carries her own grief. Her choice to hide things from Josen, born from love rather than rebellion, becomes the catalyst for everything that follows.",
  },
  {
    name: "Lashi",
    body: "Naro's loyal companion. Through Lashi, we see Naro's hopes, fears, and imagination — warmth and light amid the growing darkness.",
  },
];

export default function HeistCharactersSection() {
  const gridRef = useGridSpotlight<HTMLDivElement>();
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-3 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">04 / Characters</span>
        <h2 className="ch-display">
          Three lives, <span className="gs-accent">one collision</span>
        </h2>
      </FadeInUp>

      <div ref={gridRef} className="ch-gravity-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {CHARACTERS.map((c) => (
          <FadeInUp key={c.name}>
            <article className="ch-gravity-card">
              <span className="ch-gravity-card-halo" aria-hidden="true" />
              <span className="ch-gravity-card-glow" aria-hidden="true" />
              <h3 className="ch-gravity-card-title">{c.name}</h3>
              <p className="ch-gravity-card-body">{c.body}</p>
            </article>
          </FadeInUp>
        ))}
      </div>
    </ChSection>
  );
}
