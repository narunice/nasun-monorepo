import { useIsMobile } from "@/hooks/useIsMobile";
import { trackCrossAppNav, withCrossAppParam } from "@/lib/analytics";
import FadeInUp from "@/sections/dev/home/FadeInUp";

const VIDEO_DESKTOP = "/videos/Walden-DEX-Token-10bit-HD.mp4";
const VIDEO_MOBILE = "/videos/Walden-DEX-Token-Mobile-10bit-HD.mp4";
const VIDEO_POSTER = "/images/posters/Walden-Dex-Token-rf28.webp";

function HeroCopy() {
  return (
    <FadeInUp className="max-w-[520px] w-full flex flex-col gap-5 text-left">
      <p
        className="text-3xl md:text-4xl tracking-wider text-transparent bg-clip-text leading-none"
        style={{
          fontFamily: '"pirulen", sans-serif',
          backgroundImage: "linear-gradient(135deg, #3b82f6 0%, #93c5fd 100%)",
        }}
      >
        PADO
      </p>
      <h1 className="ch-display-wide">
        Onchain finance where{" "}
        <span className="pd-accent">standing is earned</span>.
      </h1>
      <p className="ch-lead">
        Pado is the financial execution venue inside Nasun. People and AI
        agents trade the same orderbooks, share the same risk engine, and
        compound the same onchain track record into portable authority.
      </p>
      <div className="flex flex-wrap gap-3 mt-4">
        <a
          href={withCrossAppParam("https://pado.finance/", "nasun")}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackCrossAppNav("pado", "/")}
          className="ch-btn ch-btn-lg ch-btn-primary"
        >
          Open Pado
        </a>
        <a
          href={withCrossAppParam("https://pado.finance/leaderboard", "nasun")}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackCrossAppNav("pado", "/leaderboard")}
          className="ch-btn ch-btn-lg ch-btn-ghost"
        >
          Leaderboard
        </a>
      </div>
    </FadeInUp>
  );
}

export default function PadoHeroSection() {
  // Hero split mirrors the legacy FinanceHeroSection pattern and home's
  // Hero2026Section: on desktop the wide video flows in natural aspect
  // ratio with copy floated on the right, on tablet/mobile we render the
  // vertical cut at the top (cover, slightly cropped top) with copy block
  // in flow below.
  //
  // The previous attempt reused .ch-hero (min-height: calc(100vh - 50px)
  // + bg video absolute/object-cover) which made the wide desktop video
  // crop into a vertical sliver, hence the "tiny token" effect.
  const isMobile = useIsMobile(1024);

  if (isMobile) {
    return (
      <section className="relative overflow-hidden bg-black flex flex-col">
        <div className="relative w-full">
          <video
            key="mobile"
            src={VIDEO_MOBILE}
            poster={VIDEO_POSTER}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            className="block w-full h-auto"
          />
          <div
            className="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000000 100%)",
            }}
            aria-hidden="true"
          />
        </div>
        <div className="px-6 pt-8 pb-14 flex flex-col items-start">
          <HeroCopy />
        </div>
      </section>
    );
  }

  // Desktop: video flows in natural aspect ratio; copy floats absolute on
  // the right half of a 1296px container. No min-height enforced.
  return (
    <section className="relative overflow-hidden bg-black">
      <video
        key="desktop"
        src={VIDEO_DESKTOP}
        poster={VIDEO_POSTER}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        className="block w-full h-auto"
      />

      {/* Right-side dim for copy legibility against the lit area. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to left, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.32) 35%, rgba(0,0,0,0) 65%)",
        }}
        aria-hidden="true"
      />
      {/* Bottom fade into pd0 so the hero blends into the next section. */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{
          height: "28%",
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000000 100%)",
        }}
        aria-hidden="true"
      />

      {/* Copy floats vertically centered on the right within the 1296 band. */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <div className="max-w-[1296px] mx-auto h-full relative px-6 lg:px-[72px]">
          <div className="absolute top-1/2 -translate-y-1/2 right-6 lg:right-[72px] max-w-[520px] pointer-events-auto">
            <HeroCopy />
          </div>
        </div>
      </div>
    </section>
  );
}
