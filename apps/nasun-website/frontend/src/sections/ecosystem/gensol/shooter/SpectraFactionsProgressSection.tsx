import { Crown, Crosshair } from "lucide-react";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import LazyVideoFrame from "./LazyVideoFrame";

const PROGRESS_DESKTOP = "/videos/Progress-Video-Final-rf36.mp4";
const PROGRESS_MOBILE = "/videos/Progress-Video-Final-mobile-rf28.mp4";
const PROGRESS_POSTER = "/images/posters/Progress-Video-Final-rf36.webp";

const FACTIONS = [
  {
    title: "Dorakken Empire",
    icon: Crown,
    body: "Controls the primary Spectra zones across the galaxy. Militarized. Disciplined. Ruthless in defending their monopoly.",
  },
  {
    title: "Raiders",
    icon: Crosshair,
    body: "Insurgents and pirates who steal and weaponize Spectra. Fast. Aggressive. Willing to risk everything.",
  },
];

const ALPHA_LIVE = [
  "Dedicated servers on AWS GameLift",
  "Networked combat with multiple weapon classes",
  "Full animation and effects pipeline",
  "Battle Royale test mode",
];

const IN_DEV = [
  "Kramok lava planet environment",
  "Dorakken Guards and Raider characters",
  "Team mission objectives and match flow",
  "Production HUD and menu systems",
];

export default function SpectraFactionsProgressSection() {
  return (
    <ChSection fullMinHeight={false}>
      {/* Factions */}
      <FadeInUp className="flex flex-col gap-3 items-start text-left">
        <span className="ch-eyebrow">05 / Factions</span>
        <h2 className="ch-display">
          Two factions, <span className="gs-accent">one wreck</span>
        </h2>
      </FadeInUp>

      <div className="ch-gravity-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {FACTIONS.map((f) => {
          const Icon = f.icon;
          return (
            <FadeInUp key={f.title}>
              <article className="ch-gravity-card">
                <span className="ch-gravity-card-halo" aria-hidden="true" />
                <span className="ch-gravity-card-glow" aria-hidden="true" />
                <header
                  className="ch-gravity-card-head"
                  style={{ alignItems: "center", gap: "0.65rem" }}
                >
                  <Icon
                    size={22}
                    style={{ color: "var(--ch-fg-accent)" }}
                    aria-hidden="true"
                  />
                  <h3 className="ch-gravity-card-title" style={{ margin: 0 }}>
                    {f.title}
                  </h3>
                </header>
                <p className="ch-gravity-card-body">{f.body}</p>
              </article>
            </FadeInUp>
          );
        })}
      </div>

      <FadeInUp>
        <p className="ch-body">
          Neutral worlds like Kramok become battlegrounds where both sides
          fight for survival, and neither is guaranteed to escape.
        </p>
      </FadeInUp>

      {/* Progress video */}
      <FadeInUp className="flex flex-col gap-3 items-start text-left">
        <span className="ch-eyebrow ch-eyebrow-cyan">06 / What's Live Now</span>
        <h2 className="ch-display">
          Alpha capture from <span className="gs-accent">the dev build</span>
        </h2>
      </FadeInUp>

      <FadeInUp>
        <LazyVideoFrame
          src={PROGRESS_DESKTOP}
          mobileSrc={PROGRESS_MOBILE}
          poster={PROGRESS_POSTER}
          ariaLabel="Play Spectra alpha progress video"
          caption="Spectra — alpha development capture"
        />
      </FadeInUp>

      {/* Status chips */}
      <div
        style={{
          display: "grid",
          gap: "1.5rem",
          gridTemplateColumns: "1fr",
        }}
        className="md:!grid-cols-2"
      >
        <FadeInUp>
          <div>
            <p
              style={{
                color: "#10b981",
                fontFamily: "var(--ch-font-mono)",
                fontSize: "0.75rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                marginBottom: "0.85rem",
              }}
            >
              Alpha prototype (playable)
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gap: "0.6rem",
              }}
            >
              {ALPHA_LIVE.map((item) => (
                <li
                  key={item}
                  style={{
                    padding: "0.7rem 0.85rem",
                    background: "rgba(16, 185, 129, 0.05)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    borderRadius: 10,
                    color: "var(--ch-fg-default)",
                    fontSize: "0.875rem",
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </FadeInUp>

        <FadeInUp>
          <div>
            <p
              style={{
                color: "#ffb547",
                fontFamily: "var(--ch-font-mono)",
                fontSize: "0.75rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                marginBottom: "0.85rem",
              }}
            >
              In development
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gap: "0.6rem",
              }}
            >
              {IN_DEV.map((item) => (
                <li
                  key={item}
                  style={{
                    padding: "0.7rem 0.85rem",
                    background: "rgba(255, 181, 71, 0.05)",
                    border: "1px solid rgba(255, 181, 71, 0.22)",
                    borderRadius: 10,
                    color: "var(--ch-fg-default)",
                    fontSize: "0.875rem",
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </FadeInUp>
      </div>

      <FadeInUp>
        <div className="ch-closing-card">
          <span className="ch-closing-eyebrow">Target</span>
          <h3 className="ch-closing-title">
            Q3–Q4 2026: Escape from Kramok public playtests
          </h3>
        </div>
      </FadeInUp>
    </ChSection>
  );
}
