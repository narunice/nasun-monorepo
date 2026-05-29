import React from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { OuterBox } from "@/components/ui";
import { FadeInUp } from "@/components/ui/FadeInUp";
import heroBg from "@/assets/images/The-Heist-Hero-Section-BKGD-GenSol-Symbol.webp";
import heroBgMobile from "@/assets/images/The-Heist-Hero-Section-BKGD.webp";
import heroCharacter from "@/assets/images/The-Heist-Hero-Section-Female.webp";

/**
 * TheHeistSection - Gen Sol Animation Series Page
 *
 * Content: "The Heist" — 3D Animated Sci-Fi Series
 * Source: 04C3-Ecosystem-Gen-Sol-Animation-Series-03.md
 */
function TheHeistSection() {
  return (
    <>
      {/* ========== HERO — Mobile (< lg) ========== */}
      <section className="xl:hidden relative w-full h-[80vh] md:h-screen overflow-hidden">
        {/* Background — full bleed */}
        <img
          src={heroBgMobile}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* GenSol symbol — small screens: sized to character, md+: full height */}
        <div
          className="absolute inset-0 md:hidden"
          style={{
            backgroundImage: "url(/gensol_symbol_black.svg)",
            backgroundSize: "auto 85%",
            backgroundPosition: "center bottom",
            backgroundRepeat: "no-repeat",
          }}
        />
        <div
          className="absolute inset-0 hidden md:block"
          style={{
            backgroundImage: "url(/gensol_symbol_black.svg)",
            backgroundSize: "auto 100%",
            backgroundPosition: "center bottom",
            backgroundRepeat: "no-repeat",
          }}
        />

        {/* Character — centered on top of symbol */}
        <img
          src={heroCharacter}
          alt="Senae — The Heist"
          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[80%] md:h-[85%] object-contain"
        />

        {/* Title overlay — bottom center */}
        <div className="absolute bottom-[12%] inset-x-0 z-10 text-center">
          <FadeInUp>
            <h1 className="!font-changeling font-bold tracking-[0.1em] text-nasun-white uppercase">
              The Heist
            </h1>
            <h3 className="!font-medium text-nasun-white/70">3D Animated Series</h3>
          </FadeInUp>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 inset-x-0 z-20 flex justify-center">
          <svg
            className="w-5 h-5 text-nasun-white/50 animate-bounce"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </section>

      {/* ========== HERO — Desktop (lg+) ========== */}
      <section className="hidden xl:block relative w-full h-screen overflow-hidden max-w-[1920px] mx-auto">
        {/* Background — GenSol symbol */}
        <img src={heroBg} alt="" className="w-full h-full object-cover object-center" />

        {/* Character overlay — right side */}
        <img
          src={heroCharacter}
          alt="Senae — The Heist"
          className="absolute bottom-0 right-[10%] h-[90%] object-contain"
        />

        {/* Title overlay — center-left */}
        <div className="absolute justify-items-center left-[9%] xl:left-[8%] min-[1660px]:left-[11%] top-1/2 -translate-y-1/2 text-center">
          <FadeInUp>
            <h1 className="!font-changeling font-bold tracking-[0.1em] text-gray-900 uppercase xl:text-6xl min-[1440px]:text-7xl">
              The Heist
            </h1>
            <h3 className="!font-medium text-gray-800/80 xl:text-3xl min-[1440px]:text-4xl">
              3D Animated Series
            </h3>
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </section>

      <SectionLayout className="!max-w-6xl">
        <div className="flex flex-col gap-10 md:gap-12 lg:gap-14 pt-6 md:pt-8 lg:pt-10">
          {/* ========== THE STORY ========== */}
          <section>
            <FadeInUp>
              <SectionTitle as="h4">THE STORY</SectionTitle>
            </FadeInUp>

            <div className="flex flex-col my-4 md:my-6 lg:my-8 gap-8 md:gap-10 lg:gap-12">
              {/* ACT I — Setup */}
              <FadeInUp>
                <div className="pl-5 border-l-2 border-sf-yellow/40">
                  <p className="block text-sf-yellow/80 tracking-[0.3em] uppercase font-bold mb-4">
                    Act I: The Quiet Life
                  </p>
                  <div className="space-y-3">
                    <p>
                      Josen is a farmer on the remote planet Edona, raising his nine-year-old
                      daughter Naro alone after his wife's death. Their quiet life is shaped by hard
                      work and an unspoken grief neither has confronted.
                    </p>
                    <p>
                      Josen has become overprotective, haunted by the fear of losing Naro too. To
                      spare him worry, Naro begins hiding small truths, decisions that unknowingly
                      set disaster in motion.
                    </p>
                    <p>
                      When Naro is kidnapped by a ruthless alien syndicate, <br /> Josen receives an
                      ultimatum:
                    </p>

                    <p className="font-semibold bg-gradient-to-r from-sf-yellow to-sf-orange bg-clip-text text-transparent">
                      Steal a rare cache of Spectra energy from the Dorakken Empire's vaults.
                      <br />
                      Or never see his daughter again.
                    </p>
                  </div>
                </div>
              </FadeInUp>

              {/* ACT II — The Alliance */}
              <FadeInUp delay="0.15s">
                <div className="pl-5 border-l-2 border-sf-yellow/40">
                  <p className="block text-sf-yellow/80 tracking-[0.3em] uppercase font-bold mb-4">
                    Act II: The Alliance
                  </p>
                  <p className="text-nasun-white/70 mb-4">
                    To survive the heist, Josen is forced into an uneasy alliance with:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <OuterBox color="sf-gold" padding="sm">
                      <h6 className="text-black font-bold mb-2 tracking-wide uppercase">Senae</h6>
                      <p className="text-black/90">
                        A disciplined warrior whose loyalty comes at a cost.
                      </p>
                    </OuterBox>
                    <OuterBox color="sf-gold" padding="sm">
                      <h6 className="text-black font-bold mb-2 tracking-wide uppercase">The Kid</h6>
                      <p className="text-black/90">
                        The most notorious criminal in the Gen Sol Galaxy… and the only person who
                        claims he's broken into an imperial vault and lived to tell the story.
                      </p>
                    </OuterBox>
                  </div>
                </div>
              </FadeInUp>

              {/* ACT III — Thematic closing */}
              <FadeInUp delay="0.2s">
                <div className="pl-5 border-l-2 border-sf-yellow/40">
                  <p className="block text-sf-yellow/80 tracking-[0.3em] uppercase font-bold mb-4">
                    Act III: Buried Truths
                  </p>
                  <p className="text-nasun-white/70 ">
                    What begins as a rescue mission evolves into a battle of wills, loyalties, and
                    buried truths, culminating in a finale where Josen must choose between saving his
                    daughter and losing his humanity.
                  </p>
                </div>
              </FadeInUp>
            </div>
          </section>

          {/* ========== CHARACTERS ========== */}
          <section>
            <FadeInUp>
              <SectionTitle as="h4">CHARACTERS</SectionTitle>
            </FadeInUp>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FadeInUp delay="0.1s" className="h-full">
                <OuterBox color="sf-gold" padding="sm" className="h-full">
                  <h6 className="text-black font-bold mb-3 tracking-wide uppercase">Josen</h6>
                  <p className="text-black/90">
                    A farmer scarred by loss. His wife's death left him paralyzed by fear, fear that
                    has quietly fractured his relationship with Naro. Thrust into a violent
                    underworld, he must confront who he was and what he's willing to become.
                  </p>
                </OuterBox>
              </FadeInUp>
              <FadeInUp delay="0.2s" className="h-full">
                <OuterBox color="sf-gold" padding="sm" className="h-full">
                  <h6 className="text-black font-bold mb-3 tracking-wide uppercase">Naro</h6>
                  <p className="text-black/90">
                    Intelligent, resilient, mature beyond her years. She dreams of traveling the
                    stars with her father, even as she carries her own grief. Her choice to hide
                    things from Josen, born from love rather than rebellion, becomes the catalyst
                    for everything that follows.
                  </p>
                </OuterBox>
              </FadeInUp>
              <FadeInUp delay="0.3s" className="h-full">
                <OuterBox color="sf-gold" padding="sm" className="h-full">
                  <h6 className="text-black  font-bold mb-3 tracking-wide uppercase">Lashi</h6>
                  <p className="text-black/90">
                    Naro's loyal companion. Through Lashi, we see Naro's hopes, fears, and
                    imagination, warmth and light amid the growing darkness.
                  </p>
                </OuterBox>
              </FadeInUp>
            </div>
          </section>

          {/* ========== THE GEN SOL GALAXY ========== */}
          <section className="pt-4 ">
            <FadeInUp>
              <SectionTitle as="h3" className="text-center">
                THE GEN SOL GALAXY
              </SectionTitle>
            </FadeInUp>
            <FadeInUp>
              <div className="max-w-4xl mx-auto py-4 gap-4 md:gap-5 lg:gap-6 flex flex-col">
                <p className="font-medium text-center leading-relaxed bg-gradient-to-br from-sf-yellow to-sf-orange bg-clip-text text-transparent">
                  Lush frontier worlds. <br />
                  Oppressive imperial strongholds.
                  <br /> Outlaw stations operating at the edges of the galaxy. <br />
                  Ancient technologies powered by Spectra energy. <br /> Every empire and planetary
                  system preparing for the V Games.
                </p>
                <p className="max-w-3xl mx-auto text-sf-orange">
                  The Heist introduces the Gen Sol universe: its factions, its dangers, and the power
                  struggles that will shape future stories across films, games, and series.
                </p>
              </div>
            </FadeInUp>
          </section>
        </div>
      </SectionLayout>
    </>
  );
}

export default React.memo(TheHeistSection);
