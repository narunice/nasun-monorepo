import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import { useGridSpotlight } from "@/sections/dev/_shared/useGridSpotlight";

export default function SpectraLoreSection() {
  const phantomGridRef = useGridSpotlight<HTMLDivElement>();
  return (
    <>
      <ChSection fullMinHeight={false}>
      {/* Top block — Escape from Kramok */}
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">03 / The Map</span>
        <h2 className="ch-display">
          Escape from <span className="gs-accent">Kramok</span>
        </h2>
        <p className="ch-lead">
          An unstable lava planet moments from destruction. A Dorakken Empire
          transport crashes after a Raider ambush. Both factions fight over the
          wreckage as the world tears itself apart.
        </p>
      </FadeInUp>

      {/* Editorial layout — left rule instead of card chrome.
          Two closing-card blocks: hazards on the left, stakes on the right. */}
      <div className="ch-closing-grid">
        <FadeInUp>
          <div className="ch-closing-card">
            <span className="ch-closing-eyebrow">The pressure</span>
            <h3 className="ch-closing-title">Environmental hazards</h3>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0.35rem 0 0",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {[
                "Volcanic eruptions",
                "Earthquakes carve new paths",
                "Hostile Mugox creatures swarm",
                "Match ends when planet collapses",
              ].map((item) => (
                <li
                  key={item}
                  className="ch-body"
                  style={{
                    display: "flex",
                    alignItems: "start",
                    gap: "0.55rem",
                  }}
                >
                  <span
                    style={{
                      color: "var(--ch-fg-accent)",
                      fontSize: "0.7rem",
                      marginTop: "0.45rem",
                    }}
                  >
                    ▶
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </FadeInUp>

        <FadeInUp>
          <div className="ch-closing-card">
            <span className="ch-closing-eyebrow">The stakes</span>
            <h3 className="ch-closing-title">Victory condition</h3>
            <p className="ch-body">
              First team to fuel their escape ship survives. Everyone else
              burns. Combat, timing, and risk management decide who walks away.
            </p>
          </div>
        </FadeInUp>
      </div>
      </ChSection>

      <ChSection fullMinHeight={false}>
      {/* Bottom block — Phantom system */}
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">04 / Death Isn't the End</span>
        <h2 className="ch-display">
          The <span className="gs-accent">Phantom</span> system
        </h2>
        <p className="ch-lead">
          Die and you return as a Phantom — an invisible ghost in first-person
          view. Death becomes a tactical role. Every fallen player reshapes the
          match from the shadows.
        </p>
      </FadeInUp>

      <div ref={phantomGridRef} className="ch-gravity-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <FadeInUp>
          <article className="ch-gravity-card">
            <span className="ch-gravity-card-halo" aria-hidden="true" />
            <span className="ch-gravity-card-glow" aria-hidden="true" />
            <h3 className="ch-gravity-card-title">As a Phantom you can</h3>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0.6rem 0 0",
                display: "flex",
                flexDirection: "column",
                gap: "0.55rem",
              }}
            >
              {[
                "Move unseen through the battlefield",
                "Manipulate Mugox hordes to attack enemies",
                "Hunt and destroy rival Phantoms",
                "Sabotage enemy movements and plans",
              ].map((item) => (
                <li
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "start",
                    gap: "0.6rem",
                    color: "var(--ch-fg-muted)",
                    fontSize: "0.9375rem",
                  }}
                >
                  <span style={{ color: "#d52933", marginTop: "0.1rem" }}>✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </FadeInUp>

        <FadeInUp>
          <article className="ch-gravity-card">
            <span className="ch-gravity-card-halo" aria-hidden="true" />
            <span className="ch-gravity-card-glow" aria-hidden="true" />
            <h3 className="ch-gravity-card-title">You cannot</h3>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0.6rem 0 0",
                display: "flex",
                flexDirection: "column",
                gap: "0.55rem",
              }}
            >
              {[
                "Directly attack living players",
                "Be seen by the living",
              ].map((item) => (
                <li
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "start",
                    gap: "0.6rem",
                    color: "var(--ch-fg-muted)",
                    fontSize: "0.9375rem",
                  }}
                >
                  <span style={{ color: "var(--ch-fg-faint)", marginTop: "0.1rem" }}>✗</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </FadeInUp>
      </div>
      </ChSection>
    </>
  );
}
