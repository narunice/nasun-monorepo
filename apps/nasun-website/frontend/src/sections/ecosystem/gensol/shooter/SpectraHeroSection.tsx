import { useEffect, useState } from "react";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import ChSection from "@/sections/dev/home/ChSection";
import LazyVideoFrame from "./LazyVideoFrame";
import bgDesktop from "@/assets/images/spectra-plant-raid.webp";
import bgMobile from "@/assets/images/spectra-plant-raid-mobile.webp";

const GAMEPLAY_VIDEO = "/videos/Gameplay-ArkstarGensol1-rf30.mp4";
const GAMEPLAY_POSTER = "/images/posters/Full-Trailer184s-rf28.webp";

export default function SpectraHeroSection() {
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.fetchPriority = "high";
    img.decoding = "async";
    img.src = window.innerWidth < 1024 ? bgMobile : bgDesktop;
    if (img.complete && img.naturalWidth > 0) {
      setImageReady(true);
      return;
    }
    let cancelled = false;
    const done = () => {
      if (!cancelled) setImageReady(true);
    };
    img.addEventListener("load", done);
    img.addEventListener("error", done);
    return () => {
      cancelled = true;
      img.removeEventListener("load", done);
      img.removeEventListener("error", done);
    };
  }, []);

  const scrollToGameplay = () => {
    document
      .getElementById("gameplay")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <section
        className="ch-hero"
        style={{
          alignItems: "flex-end",
        }}
      >
        <picture>
          <source media="(min-width: 1024px)" srcSet={bgDesktop} />
          <img
            className="ch-hero-bg"
            src={bgMobile}
            alt=""
            aria-hidden="true"
            decoding="async"
            fetchPriority="high"
            style={{
              opacity: imageReady ? 1 : 0,
              transition: "opacity 800ms ease-out",
              zIndex: -2,
            }}
          />
        </picture>

        {/* Bottom-up readability gradient — same pattern as the main hero
            so the title block always lands against a dark floor. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            background:
              "linear-gradient(to top, #0a0f15 0%, rgba(10,15,21,0.92) 18%, rgba(10,15,21,0.55) 40%, rgba(10,15,21,0.05) 65%, transparent 85%)",
            pointerEvents: "none",
          }}
        />
        <div className="gs-hero-vignette" aria-hidden="true" />

        <div
          className="ch-container"
          style={{
            position: "relative",
            zIndex: 1,
            opacity: imageReady ? 1 : 0,
            transition: "opacity 300ms ease-out",
          }}
        >
          <FadeInUp className="max-w-[760px] mx-auto md:mx-0 flex flex-col items-start text-left">
            <span className="ch-eyebrow">01 / Shooter</span>
            <h1 className="ch-display-wide mt-4">
              <span className="gs-accent">Crash. Compete. Escape</span>
              <br />
              or perish.
            </h1>
            <p className="ch-lead mt-3">
              A competitive multiplayer sci-fi shooter built in Unreal Engine 5.
              Teams crash-land on hostile alien worlds and race to extract
              Spectra before the environment kills everyone, and each other.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <button
                type="button"
                onClick={scrollToGameplay}
                className="ch-btn ch-btn-lg ch-btn-primary"
              >
                Watch Gameplay ↓
              </button>
            </div>
          </FadeInUp>
        </div>
      </section>

      <ChSection fullMinHeight={false}>
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
    </>
  );
}
