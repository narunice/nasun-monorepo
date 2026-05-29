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
        minHeight: "calc(100vh - 50px)",
        position: "relative",
        overflow: "hidden",
        padding: 0,
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
        className="ch-container"
        style={{
          opacity: ready ? 1 : 0,
          transition: "opacity 300ms ease-out",
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          paddingBottom: "12vh",
          minHeight: "calc(100vh - 50px)",
        }}
      >
        <FadeInUp className="text-center xl:text-left max-w-[640px] xl:mr-auto xl:ml-[6%]">
          <span className="ch-eyebrow">02 / Animation</span>
          <h1 className="ch-display-wide mt-4">
            <span className="gs-accent">The Heist</span>
          </h1>
          <p
            style={{
              fontFamily: "var(--ch-font-display)",
              fontWeight: 500,
              fontSize: "1.25rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ch-fg-subdued)",
              margin: "0.5rem 0 0",
            }}
          >
            An 8-Episode 3D Animated Series
          </p>
        </FadeInUp>
      </div>
    </section>
  );
}
