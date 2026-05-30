import { useEffect, useState } from "react";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import heroBgDesktop from "@/assets/images/The-Heist-Hero-Section-BKGD-GenSol-Symbol.webp";
import heroBgMobile from "@/assets/images/The-Heist-Hero-Section-BKGD.webp";
import heroCharacter from "@/assets/images/The-Heist-Hero-Section-Female.webp";

export default function HeistHeroSection() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.fetchPriority = "high";
    img.decoding = "async";
    img.src = window.innerWidth < 1280 ? heroBgMobile : heroBgDesktop;
    if (img.complete && img.naturalWidth > 0) {
      setReady(true);
      return;
    }
    let cancelled = false;
    const done = () => {
      if (!cancelled) setReady(true);
    };
    img.addEventListener("load", done);
    img.addEventListener("error", done);
    return () => {
      cancelled = true;
      img.removeEventListener("load", done);
      img.removeEventListener("error", done);
    };
  }, []);

  return (
    <section
      className="ch-hero"
      style={{
        paddingTop: 0,
        paddingBottom: 0,
      }}
    >
      <picture>
        <source media="(min-width: 1280px)" srcSet={heroBgDesktop} />
        <img
          className="ch-hero-bg"
          src={heroBgMobile}
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchPriority="high"
          style={{
            opacity: ready ? 1 : 0,
            transition: "opacity 800ms ease-out",
            zIndex: -2,
          }}
        />
      </picture>

      {/* Character overlay — centered bottom on mobile, right-anchored on desktop */}
      <img
        src={heroCharacter}
        alt="Senae — The Heist"
        decoding="async"
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          height: "78%",
          objectFit: "contain",
          zIndex: 1,
          opacity: ready ? 1 : 0,
          transition: "opacity 800ms ease-out 200ms",
        }}
        className="xl:!left-auto xl:!right-[10%] xl:!translate-x-0 xl:!h-[88%]"
      />

      <div
        className="ch-container relative z-[2] flex min-h-[calc(100vh-50px)] items-end justify-center pb-[12vh] xl:items-center xl:justify-start xl:pb-0"
        style={{
          opacity: ready ? 1 : 0,
          transition: "opacity 300ms ease-out",
        }}
      >
        <FadeInUp className="text-center xl:text-left max-w-[640px] xl:max-w-[760px]">
          <span className="ch-eyebrow gs-heist-eyebrow">02 / Animation</span>
          <h1 className="ch-display-wide mt-4 xl:!text-6xl min-[1440px]:!text-7xl !leading-[1.05] uppercase">
            <span className="gs-heist-title">The Heist</span>
          </h1>
          <p
            className="xl:!text-2xl min-[1440px]:!text-3xl gs-heist-subtitle"
            style={{
              fontFamily: "var(--ch-font-display)",
              fontWeight: 500,
              fontSize: "1.25rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              margin: "0.85rem 0 0",
            }}
          >
            An 8-Episode 3D Animated Series
          </p>
        </FadeInUp>
      </div>
    </section>
  );
}
