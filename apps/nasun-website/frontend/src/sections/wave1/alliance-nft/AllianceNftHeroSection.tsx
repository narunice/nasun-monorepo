import React from "react";
import { FadeInUp } from "@/components/ui/FadeInUp";
import PrincessKaebo from "@/assets/images/Princess-Kaebo-Transparency.webp";

const GRADIENT =
  "linear-gradient(135deg, #141e30 0%, #1e3a5f 35%, #3a6186 65%, #6b8fad 100%)";
const RADIAL_GLOW =
  "radial-gradient(ellipse at 75% 50%, rgba(110,160,210,0.15), transparent 60%)";
const BOTTOM_VIGNETTE =
  "linear-gradient(to top, rgba(25,22,21,0.9) 0%, transparent 40%)";

function AllianceNftHeroSection() {
  return (
    <>
      {/* ========== HERO - Mobile (< lg) ========== */}
      <section
        className="lg:hidden relative w-full h-[85vh] md:h-screen overflow-hidden"
        style={{ background: GRADIENT }}
      >
        {/* Atmospheric overlays */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: RADIAL_GLOW }}
        />

        {/* Character - centered on mobile, right-biased on md */}
        <img
          src={PrincessKaebo}
          alt="Alliance character"
          className="absolute bottom-0 right-[-10%] md:right-0 h-[80%] md:h-[90%] object-cover object-top"
        />

        {/* Bottom gradient for text readability */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(20,30,48,0.95) 0%, rgba(20,30,48,0.7) 30%, transparent 55%)",
          }}
        />

        {/* Title overlay - bottom area */}
        <div className="absolute bottom-12 inset-x-0 z-10 px-6 md:px-12">
          <FadeInUp>
            <div className="text-center md:text-left md:max-w-[55%]">
              <h1 className="!font-eurostile text-nasun-white uppercase text-4xl md:text-5xl tracking-[0.15em] leading-none">
                ALLIANCE
              </h1>
              <p className="!font-eurostile uppercase text-lg md:text-xl tracking-wider mt-2 text-[#5ecbf0]">
                FREE MINT EVENT
              </p>
              <p className="!font-rubik font-bold text-nasun-white text-sm md:text-base mt-4">
                Unlock Your Powers
              </p>
              <ul className="mt-2 space-y-0.5 text-nasun-white/90 text-xs md:text-sm !font-rubik list-disc pl-5">
                <li>Daily Points</li>
                <li>Air Drops</li>
                <li>Test and Earn</li>
                <li>Leaderboards</li>
                <li>Exclusive Events</li>
                <li>Allowlists Priority</li>
              </ul>
            </div>
          </FadeInUp>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-3 inset-x-0 z-20 flex justify-center">
          <svg
            className="w-5 h-5 text-nasun-white/50 animate-bounce"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </div>
      </section>

      {/* ========== HERO - Desktop (xl+) ========== */}
      <section
        className="hidden lg:block relative w-full h-screen overflow-hidden max-w-[1920px] mx-auto"
        style={{ background: GRADIENT }}
      >
        {/* Atmospheric overlays */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: RADIAL_GLOW }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: BOTTOM_VIGNETTE }}
        />

        {/* Character - right side */}
        <img
          src={PrincessKaebo}
          alt="Alliance character"
          className="absolute bottom-0 right-[3%] h-[90%] object-contain"
          fetchPriority="high"
        />

        {/* Title overlay - centered in left half */}
        <div className="absolute left-20 top-[55%] -translate-y-1/2 w-[55%] flex justify-center pl-20">
          <FadeInUp>
            <div className="text-center">
              <h1 className="!font-eurostile text-nasun-white uppercase lg:text-6xl min-[1440px]:text-7xl tracking-[0.15em] leading-none">
                ALLIANCE
              </h1>
              <p className="!font-eurostile uppercase lg:text-3xl min-[1440px]:text-4xl tracking-wider mt-3 text-[#5ecbf0]">
                FREE MINT EVENT
              </p>
            </div>
            <div className="text-left mt-8 max-w-sm mx-auto">
              <p className="!font-rubik font-semibold text-nasun-white text-xl lg:text-2xl min-[1440px]:text-3xl tracking-wider">
                Unlock Your Powers
              </p>
              <ul className="mt-4 space-y-1.5 text-nasun-white/90 !font-rubik list-disc pl-6">
                <li className="text-base lg:text-xl">Daily Points</li>
                <li className="text-base lg:text-xl">Air Drops</li>
                <li className="text-base lg:text-xl">Test and Earn</li>
                <li className="text-base lg:text-xl">Leaderboards</li>
                <li className="text-base lg:text-xl">Exclusive Events</li>
                <li className="text-base lg:text-xl">Allowlists Priority</li>
              </ul>
            </div>
          </FadeInUp>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 inset-x-0 z-20 flex justify-center">
          <svg
            className="w-6 h-6 text-nasun-white/50 animate-bounce"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </div>
      </section>
    </>
  );
}

export default React.memo(AllianceNftHeroSection);
