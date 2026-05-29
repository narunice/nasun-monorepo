import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";

export default function HeistGalaxySection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-3 items-center text-center">
        <span className="ch-eyebrow">05 / The Gen Sol Galaxy</span>
        <h2 className="ch-display">
          The world the <span className="gs-accent">heist opens</span>
        </h2>
      </FadeInUp>

      <FadeInUp>
        <p
          className="gs-accent"
          style={{
            fontFamily: "var(--ch-font-display)",
            fontWeight: 500,
            fontSize: "1.25rem",
            lineHeight: 1.55,
            textAlign: "center",
            maxWidth: 760,
            margin: "0 auto",
          }}
        >
          Lush frontier worlds. Oppressive imperial strongholds. Outlaw stations
          operating at the edges of the galaxy. Ancient technologies powered by
          Spectra energy. Every empire and planetary system preparing for the
          V Games.
        </p>
      </FadeInUp>

      <FadeInUp>
        <p
          className="ch-body"
          style={{
            textAlign: "center",
            maxWidth: 720,
            margin: "0 auto",
          }}
        >
          The Heist introduces the Gen Sol universe — its factions, its dangers,
          and the power struggles that will shape future stories across films,
          games, and series.
        </p>
      </FadeInUp>
    </ChSection>
  );
}
