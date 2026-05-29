import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";

export default function PlanHeroSection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-3 items-center text-center">
        <span className="ch-eyebrow">00 / Plan</span>
        <h1 className="ch-display-wide">
          A sci-fi universe across <span className="gs-accent">games, animation, film</span>
        </h1>
      </FadeInUp>

      <FadeInUp>
        <p
          className="ch-lead"
          style={{ textAlign: "center", margin: "0 auto" }}
        >
          Gen Sol is built around one question:{" "}
          <strong style={{ color: "var(--ch-fg-display)", fontWeight: 600 }}>
            What would you sacrifice to control the galaxy's most powerful resource?
          </strong>
        </p>
      </FadeInUp>

      <FadeInUp>
        <p className="ch-body" style={{ textAlign: "center", maxWidth: 760, margin: "0 auto" }}>
          Every story takes place in the Gen Sol Galaxy, where{" "}
          <span style={{ color: "#ffb547", fontWeight: 500 }}>Spectra</span>{" "}
          fuels ships, weapons, and entire civilizations. Production is led with
          Korean filmmakers, actors, writers, and gaming/animation studios — all
          content shipped in English, designed for global audiences.
        </p>
      </FadeInUp>
    </ChSection>
  );
}
