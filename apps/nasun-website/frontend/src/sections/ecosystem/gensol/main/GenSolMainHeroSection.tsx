import { useEffect, useState } from "react";
import FadeInUp from "@/sections/dev/home/FadeInUp";
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

  const scrollDown = () => {
    window.scrollBy({
      top: window.innerHeight - 50,
      behavior: "smooth",
    });
  };

  return (
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

      {/* Content sits at the bottom of the hero — gives the artwork the
          full top 60% to breathe, then the title block lands against the
          dark gradient floor where it's always readable. */}
      <div
        className="ch-container"
        style={{
          position: "relative",
          zIndex: 1,
          opacity: imageReady ? 1 : 0,
          transition: "opacity 300ms ease-out",
        }}
      >
        <FadeInUp className="max-w-[760px] mx-auto md:mx-0 flex flex-col items-center md:items-start text-center md:text-left">
          <span className="ch-eyebrow">00 / Gen Sol</span>
          <h1 className="ch-display-wide mt-4">
            A Bold <span className="gs-accent">Sci-Fi Universe</span>
            <br />
            Across Games, Animation, Film
          </h1>
          <p className="ch-lead mt-3">
            Striking visuals, rich lore, characters driven by purpose and
            conflict. Gen Sol powers a transmedia world where Spectra fuels
            every empire and every rebellion.
          </p>
        </FadeInUp>
      </div>

      {/* Scroll indicator — chevron-only, bounces to invite scroll down. */}
      <button
        type="button"
        onClick={scrollDown}
        aria-label="Scroll down"
        className="group"
        style={{
          position: "absolute",
          bottom: "1.5rem",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 2,
          background: "transparent",
          border: "none",
          padding: "0.5rem",
          cursor: "pointer",
          color: "rgba(232, 234, 236, 0.7)",
          transition: "color 200ms ease",
          opacity: imageReady ? 1 : 0,
        }}
      >
        <svg
          className="animate-bounce"
          width="22"
          height="22"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>
    </section>
  );
}
