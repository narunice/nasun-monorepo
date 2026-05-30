import { Link } from "react-router-dom";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";

import shooterArt from "@/assets/images/spectra-plant-raid.webp";
import heistArt from "@/assets/images/The-Heist-Hero-Section.webp";

type BuildCard = {
  to: string;
  status: "live" | "alpha" | "soon";
  statusLabel: string;
  eyebrow: string;
  title: string;
  body: string;
  art: string;
};

const CARDS: BuildCard[] = [
  {
    to: "/ecosystem/gensol/shooter",
    status: "alpha",
    statusLabel: "Playable Prototype",
    eyebrow: "Shooter",
    title: "Spectra",
    body: "Crash. Compete. Escape, or perish. A multiplayer sci-fi shooter built in Unreal Engine 5 — playable prototype already running on dedicated servers.",
    art: shooterArt,
  },
  {
    to: "/ecosystem/gensol/animation",
    status: "alpha",
    statusLabel: "Pre-Production",
    eyebrow: "Animation",
    title: "The Heist",
    body: "An 8-episode 3D animated series about a farmer forced into the galaxy's most dangerous heist to save his daughter. Episode 1 script and concept art complete.",
    art: heistArt,
  },
];

export default function GenSolMainBuildingSection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-4 items-start text-left">
        <span className="ch-eyebrow">04 / The Slate</span>
        <h2 className="ch-display">
          What we're <span className="gs-accent">building now</span>
        </h2>
      </FadeInUp>

      <div
        style={{
          display: "grid",
          gap: "1.25rem",
          gridTemplateColumns: "1fr",
        }}
        className="md:!grid-cols-2"
      >
        {CARDS.map((card) => (
          <FadeInUp key={card.to}>
            <Link
              to={card.to}
              style={{
                display: "block",
                position: "relative",
                borderRadius: 20,
                overflow: "hidden",
                border: "1px solid rgba(213, 41, 51, 0.18)",
                background: "#03080d",
                textDecoration: "none",
                color: "inherit",
                transition: "border-color 320ms ease, transform 360ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              className="ch-product-build-card"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(255, 181, 71, 0.42)";
                e.currentTarget.style.transform = "translateY(-3px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(213, 41, 51, 0.18)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div
                style={{
                  position: "relative",
                  aspectRatio: "16 / 9",
                  overflow: "hidden",
                }}
              >
                <img
                  src={card.art}
                  alt=""
                  loading="lazy"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>
              <div style={{ padding: "1.5rem 1.5rem 1.6rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.85rem",
                  }}
                >
                  <span className="ch-eyebrow">{card.eyebrow}</span>
                  <span className="ch-status" data-status={card.status}>
                    {card.statusLabel}
                  </span>
                </div>
                <h3
                  style={{
                    fontFamily: "var(--ch-font-display)",
                    fontWeight: 500,
                    fontSize: "1.75rem",
                    lineHeight: 1.15,
                    color: "var(--ch-fg-display)",
                    margin: "0 0 0.6rem",
                  }}
                >
                  {card.title}
                </h3>
                <p
                  style={{
                    fontFamily: "var(--ch-font-body)",
                    fontWeight: 300,
                    fontSize: "0.9375rem",
                    lineHeight: 1.55,
                    color: "var(--ch-fg-muted)",
                    margin: 0,
                  }}
                >
                  {card.body}
                </p>
              </div>
            </Link>
          </FadeInUp>
        ))}
      </div>
    </ChSection>
  );
}
