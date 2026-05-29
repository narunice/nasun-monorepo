import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";

type Act = {
  eyebrow: string;
  paragraphs: (string | { accent: string })[];
};

const ACTS: Act[] = [
  {
    eyebrow: "Act I: The Quiet Life",
    paragraphs: [
      "Josen is a farmer on the remote planet Edona, raising his nine-year-old daughter Naro alone after his wife's death. Their quiet life is shaped by hard work and an unspoken grief neither has confronted.",
      "Josen has become overprotective, haunted by the fear of losing Naro too. To spare him worry, Naro begins hiding small truths — decisions that unknowingly set disaster in motion.",
      "When Naro is kidnapped by a ruthless alien syndicate, Josen receives an ultimatum:",
      { accent: "Steal a rare cache of Spectra energy from the Dorakken Empire's vaults. Or never see his daughter again." },
    ],
  },
  {
    eyebrow: "Act II: The Alliance",
    paragraphs: [
      "To survive the heist, Josen is forced into an uneasy alliance with two figures from the galaxy's underworld: Senae, a disciplined warrior whose loyalty comes at a cost, and The Kid, the most notorious criminal in the Gen Sol Galaxy — and the only person who claims he's broken into an imperial vault and lived to tell the story.",
    ],
  },
  {
    eyebrow: "Act III: Buried Truths",
    paragraphs: [
      "What begins as a rescue mission evolves into a battle of wills, loyalties, and buried truths, culminating in a finale where Josen must choose between saving his daughter and losing his humanity.",
    ],
  },
];

export default function HeistStorySection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-3 items-start text-left">
        <span className="ch-eyebrow">03 / The Story</span>
        <h2 className="ch-display">
          A father, a daughter, <span className="gs-accent">an impossible heist</span>
        </h2>
      </FadeInUp>

      <div style={{ display: "flex", flexDirection: "column", gap: "2.75rem" }}>
        {ACTS.map((act) => (
          <FadeInUp key={act.eyebrow}>
            <div className="ch-rule-left">
              <p
                style={{
                  fontFamily: "var(--ch-font-mono)",
                  fontWeight: 500,
                  fontSize: "0.75rem",
                  letterSpacing: "0.3em",
                  textTransform: "uppercase",
                  color: "var(--ch-fg-accent)",
                  marginBottom: "0.85rem",
                }}
              >
                {act.eyebrow}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                {act.paragraphs.map((para, i) =>
                  typeof para === "string" ? (
                    <p key={i} className="ch-body">
                      {para}
                    </p>
                  ) : (
                    <p
                      key={i}
                      className="gs-accent"
                      style={{
                        fontFamily: "var(--ch-font-display)",
                        fontWeight: 500,
                        fontSize: "1.125rem",
                        lineHeight: 1.4,
                      }}
                    >
                      {para.accent}
                    </p>
                  ),
                )}
              </div>
            </div>
          </FadeInUp>
        ))}
      </div>
    </ChSection>
  );
}
