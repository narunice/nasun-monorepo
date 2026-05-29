import { Link } from "react-router-dom";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";

type Pillar = {
  eyebrow: string;
  title: string;
  subtitle: string;
  body: string;
  ctaTo?: string;
  ctaLabel?: string;
};

const PILLARS: Pillar[] = [
  {
    eyebrow: "Animation",
    title: "The Heist",
    subtitle: "8-Episode 3D Animated Series",
    body: "Josen is a farmer on a remote planet, raising his daughter Naro alone after his wife's death. When Naro is kidnapped by an alien syndicate, Josen receives an ultimatum: steal rare Spectra from the Dorakken Empire's vaults, or never see her again. To survive the heist, he's forced into an alliance with The Kid — the galaxy's most infamous criminal. A father's desperate rescue becomes a battle of wills, loyalties, and buried truths.",
    ctaTo: "/ecosystem/gensol/animation",
    ctaLabel: "Read the synopsis →",
  },
  {
    eyebrow: "Live-Action",
    title: "The Heir Apparent",
    subtitle: "Streaming Series",
    body: "The Dorakken Empire has won 29 consecutive V Games, maintaining control of the Vertex Zone for decades. But the Emperor is dying from injuries sustained in the last competition. Three siblings — two brothers and a sister — wage a ruthless war for succession. Each believes they're destined not only to rule the empire but to become the next legendary driver in the V Games. The series exposes the political machinery, technology, and mysticism that govern the Gen Sol Galaxy, and the brutal cost of maintaining power.",
  },
  {
    eyebrow: "Film",
    title: "The V Games Trilogy",
    subtitle: "Feature Film Trilogy",
    body: "Moonoak, a poor kid from the galaxy's forgotten regions, rises to become one of the greatest mech drivers in V Games history. Her rise ignites an obsession in the true heir of the Dorakken Empire, forging a rivalry that reshapes the galaxy and culminates in the V Games themselves.",
  },
];

export default function PlanPillarsSection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-3 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">02 / The Pillars</span>
        <h2 className="ch-display">
          Three productions, <span className="gs-accent">one universe</span>
        </h2>
      </FadeInUp>

      <div style={{ display: "flex", flexDirection: "column", gap: "2.75rem" }}>
        {PILLARS.map((p) => (
          <FadeInUp key={p.title}>
            <div className="ch-rule-left">
              <p
                style={{
                  fontFamily: "var(--ch-font-mono)",
                  fontWeight: 500,
                  fontSize: "0.75rem",
                  letterSpacing: "0.3em",
                  textTransform: "uppercase",
                  color: "var(--ch-fg-accent)",
                  marginBottom: "0.6rem",
                }}
              >
                {p.eyebrow}
              </p>
              <h3
                style={{
                  fontFamily: "var(--ch-font-display)",
                  fontWeight: 500,
                  fontSize: "1.5rem",
                  lineHeight: 1.2,
                  color: "var(--ch-fg-display)",
                  margin: "0 0 0.35rem",
                }}
              >
                {p.title}
              </h3>
              <p
                style={{
                  fontFamily: "var(--ch-font-mono)",
                  fontSize: "0.75rem",
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--ch-fg-subdued)",
                  margin: "0 0 0.85rem",
                }}
              >
                {p.subtitle}
              </p>
              <p className="ch-body" style={{ marginBottom: p.ctaTo ? "1rem" : 0 }}>
                {p.body}
              </p>
              {p.ctaTo && p.ctaLabel && (
                <Link
                  to={p.ctaTo}
                  className="ch-btn ch-btn-sm ch-btn-ghost"
                  style={{ marginTop: "0.5rem" }}
                >
                  {p.ctaLabel}
                </Link>
              )}
            </div>
          </FadeInUp>
        ))}
      </div>
    </ChSection>
  );
}
