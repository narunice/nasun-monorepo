import { useEffect, useState } from "react";
import FadeInUp from "@/sections/dev/home/FadeInUp";

const HERO_DESKTOP = "/images/posters/Triangle-Hero-Section-BW-poster.webp";
// Reuse the existing robot arena hero plate as the GenSol main hero background.
import bgDesktop from "@/assets/images/robot-arena-hq.webp";
import bgMobile from "@/assets/images/robot-arena-mobile.webp";

export default function GenSolMainHeroSection() {
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

  const scrollToTrailer = () => {
    document
      .getElementById("trailer")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="ch-hero" style={{ minHeight: "calc(100vh - 50px)" }}>
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
          // suppress unused poster const warning by not using HERO_DESKTOP
          data-poster={HERO_DESKTOP}
        />
      </picture>
      <div className="gs-hero-vignette" aria-hidden="true" />

      <div
        className="ch-container flex justify-end"
        style={{
          opacity: imageReady ? 1 : 0,
          transition: "opacity 300ms ease-out",
        }}
      >
        <FadeInUp className="max-w-[640px] mr-4 md:mr-8 lg:mr-[6%] xl:mr-[10%] flex flex-col text-right md:text-left">
          <span className="ch-eyebrow">00 / Gen Sol</span>
          <h1 className="ch-display-wide mt-6">
            A Bold <span className="gs-accent">Sci-Fi Universe</span>
            <br />
            Across Games, Animation, Film
          </h1>
          <p className="ch-lead mt-3">
            Striking visuals, rich lore, characters driven by purpose and
            conflict. Gen Sol powers a transmedia world where Spectra fuels
            every empire and every rebellion.
          </p>
          <div className="flex flex-wrap gap-3 justify-end md:justify-start mt-6">
            <button
              type="button"
              onClick={scrollToTrailer}
              className="ch-btn ch-btn-lg ch-btn-primary"
            >
              Watch Trailer ↓
            </button>
          </div>
        </FadeInUp>
      </div>
    </section>
  );
}
