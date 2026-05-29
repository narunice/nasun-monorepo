import { Link } from "react-router-dom";
import { Gamepad2, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";

type Game = {
  title: string;
  subtitle: string;
  status: "live" | "alpha" | "soon";
  statusLabel: string;
  icon: LucideIcon;
  body: string;
  ctaTo?: string;
  ctaLabel?: string;
};

const GAMES: Game[] = [
  {
    title: "Spectra",
    subtitle: "Multiplayer Sci-Fi Shooter",
    status: "alpha",
    statusLabel: "Alpha Live",
    icon: Gamepad2,
    body: "Teams crash-land on hostile alien worlds and race to extract Spectra before the environment kills everyone. Built in Unreal Engine C++. Live multiplayer with dedicated servers, multiple weapon classes, server-rewind hit detection.",
    ctaTo: "/ecosystem/gensol/shooter",
    ctaLabel: "Open the shooter page →",
  },
  {
    title: "The V Games",
    subtitle: "Flagship Competitive Game",
    status: "soon",
    statusLabel: "In Development",
    icon: Trophy,
    body: "Every three years, the V Games decide who controls the Vertex Zone — a galaxy-wide competition where elite drivers of giant mechs battle it out. Over time, narrative content and gameplay converge toward the first feature film and a fully realized V Games tournament.",
  },
];

export default function PlanGamesSection() {
  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-3 items-start text-left">
        <span className="ch-eyebrow">03 / Games</span>
        <h2 className="ch-display">
          Two playable <span className="gs-accent">battlegrounds</span>
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
        {GAMES.map((g) => {
          const Icon = g.icon;
          return (
            <FadeInUp key={g.title}>
              <article
                className="ch-step-card ch-product-card"
                style={{ position: "relative" }}
              >
                <span className="ch-step-card-halo" aria-hidden="true" />
                <span className="ch-step-card-glow" aria-hidden="true" />
                <span className="ch-product-card-rail" aria-hidden="true" />
                <header
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                >
                  <Icon
                    className="pd-card-icon"
                    aria-hidden="true"
                    style={{ width: 28, height: 28, color: "var(--ch-fg-accent)" }}
                  />
                  <span className="ch-status" data-status={g.status}>
                    {g.statusLabel}
                  </span>
                </header>
                <h3 className="ch-step-card-title" style={{ marginTop: 4 }}>
                  {g.title}
                </h3>
                <p
                  style={{
                    fontFamily: "var(--ch-font-mono)",
                    fontSize: "0.75rem",
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: "var(--ch-fg-subdued)",
                    margin: "0 0 0.6rem",
                  }}
                >
                  {g.subtitle}
                </p>
                <p className="ch-step-card-body">{g.body}</p>
                {g.ctaTo && g.ctaLabel && (
                  <Link
                    to={g.ctaTo}
                    className="ch-btn ch-btn-sm ch-btn-ghost"
                    style={{ marginTop: "0.85rem", alignSelf: "flex-start" }}
                  >
                    {g.ctaLabel}
                  </Link>
                )}
              </article>
            </FadeInUp>
          );
        })}
      </div>
    </ChSection>
  );
}
