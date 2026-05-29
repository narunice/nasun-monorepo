import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import LazyVideoFrame from "./LazyVideoFrame";

const GAMEPLAY_VIDEO = "/videos/Gameplay-ArkstarGensol1-rf30.mp4";
// Reuse the trailer poster as a graceful fallback until a dedicated gameplay
// poster exists; the lazy-mount IO still gates the video itself.
const GAMEPLAY_POSTER = "/images/posters/Full-Trailer184s-rf28.webp";

export default function SpectraHeroSection() {
  const scrollToGameplay = () => {
    document
      .getElementById("gameplay")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-3 items-start text-left">
        <span className="ch-eyebrow">01 / Shooter</span>
        <h1 className="ch-display-wide">
          <span className="gs-accent">Crash. Compete. Escape</span>
          <br />
          or perish.
        </h1>
        <p className="ch-lead">
          A competitive multiplayer sci-fi shooter built in Unreal Engine 5.
          Teams crash-land on hostile alien worlds and race to extract Spectra
          before the environment kills everyone — and each other.
        </p>
        <div className="flex flex-wrap gap-3 mt-5">
          <button
            type="button"
            onClick={scrollToGameplay}
            className="ch-btn ch-btn-lg ch-btn-primary"
          >
            Watch Gameplay ↓
          </button>
          <span className="ch-status" data-status="alpha">
            Alpha Live
          </span>
        </div>
      </FadeInUp>

      <FadeInUp>
        <div id="gameplay" style={{ scrollMarginTop: 80 }}>
          <LazyVideoFrame
            src={GAMEPLAY_VIDEO}
            poster={GAMEPLAY_POSTER}
            ariaLabel="Play Spectra gameplay video"
            caption="Spectra — alpha gameplay capture"
          />
        </div>
      </FadeInUp>
    </ChSection>
  );
}
