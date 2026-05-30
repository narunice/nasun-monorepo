import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import { useGridSpotlight } from "@/sections/dev/_shared/useGridSpotlight";

type Pillar = {
  index: string;
  eyebrow: string;
  title: string;
  body: string;
};

const COLUMNS: Pillar[] = [
  {
    index: "01",
    eyebrow: "Resource",
    title: "Spectra",
    body: "The galaxy's most coveted fuel. Powers ships, weapons, and entire civilizations. Its scarcity turns desire into obsession.",
  },
  {
    index: "02",
    eyebrow: "Factions",
    title: "Empires & Outlaws",
    body: "The Dorakken Empire holds the Vertex Zone, the galaxy's only source of Spectra. Raiders, mercenaries, and outlaws spend their lives plotting how to break in.",
  },
  {
    index: "03",
    eyebrow: "Planets",
    title: "Frontier Worlds",
    body: "Lush frontier planets, oppressive imperial strongholds, outlaw stations on the edges — every world preparing for the V Games.",
  },
];

export default function GenSolMainUniverseSection() {
  const gridRef = useGridSpotlight<HTMLDivElement>();
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">03 / The Universe</span>
        <h2 className="ch-display">
          One galaxy, <span className="gs-accent">three obsessions</span>
        </h2>
      </FadeInUp>

      <div
        ref={gridRef}
        className="ch-gravity-grid"
        style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
      >
        {COLUMNS.map((c) => (
          <FadeInUp key={c.index}>
            <article className="ch-gravity-card">
              <span className="ch-gravity-card-halo" aria-hidden="true" />
              <span className="ch-gravity-card-glow" aria-hidden="true" />
              <header className="ch-gravity-card-head">
                <span className="ch-gravity-card-eyebrow">{c.eyebrow}</span>
                <span className="ch-gravity-card-num">{c.index}</span>
              </header>
              <h3 className="ch-gravity-card-title">{c.title}</h3>
              <p className="ch-gravity-card-body">{c.body}</p>
            </article>
          </FadeInUp>
        ))}
      </div>
    </ChSection>
  );
}
