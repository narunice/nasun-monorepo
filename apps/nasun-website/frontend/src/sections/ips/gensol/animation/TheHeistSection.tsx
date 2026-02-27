import React from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { OuterBox } from "@/components/ui";
import heroBg from "@/assets/images/The-Heist-Hero-Section-BKGD-GenSol-Symbol.webp";
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
      {/* ========== HERO — Layered composition ========== */}
      <section className="relative w-full h-screen overflow-hidden max-w-[1920px] mx-auto">
        {/* Background — GenSol symbol */}
        <img src={heroBg} alt="" className="w-full h-full object-cover object-center" />

        {/* Character overlay — right side */}
        <img
          src={heroCharacter}
          alt="Senae — The Heist"
          className="absolute bottom-0 right-[5%] md:right-[10%] h-[85%] md:h-[90%] object-contain"
        />

        {/* Title overlay — center-left */}
        <div className="absolute justify-items-center left-[5%] md:left-[7%] lg:left-[9%] xl:left-[11%] top-1/2 -translate-y-1/2">
          <h1 className="!font-changeling font-bold tracking-[0.1em] text-gray-900 uppercase">
            The Heist
          </h1>
          <h3 className=" !font-medium text-gray-800/80">3D Animated Series</h3>
        </div>
      </section>

      <SectionLayout className="!max-w-6xl">
        <div className="flex flex-col gap-10 md:gap-12 lg:gap-14">
          {/* ========== THE STORY ========== */}
          <section>
            <SectionTitle as="h4">THE STORY</SectionTitle>

            {/* Atmosphere label */}
            <p className="text-nasun-white/50 tracking-[0.3em] uppercase mb-10">
              wills, loyalties, and buried truths
            </p>

            <div className="space-y-10">
              {/* ACT I — Setup */}
              <div className="pl-5 border-l-2 border-nasun-nw3/70">
                <small className="block text-nasun-nw4/70 tracking-[0.3em] uppercase font-bold mb-4">
                  Act I — The Quiet Life
                </small>
                <div className="space-y-3">
                  <p>
                    Josen is a farmer on the remote planet Edona, raising his nine-year-old daughter
                    Naro alone after his wife's death. Their quiet life is shaped by hard work—and
                    an unspoken grief neither has confronted.
                  </p>
                  <p>
                    Josen has become overprotective, haunted by the fear of losing Naro too. To
                    spare him worry, Naro begins hiding small truths—decisions that unknowingly set
                    disaster in motion.
                  </p>
                  <p className="text-nasun-nw4/80 tracking-[0.3em] uppercase text-center mb-6">
                    When Naro is kidnapped by a ruthless alien syndicate, <br /> Josen receives an
                    ultimatum:
                  </p>

                  <p className="text-nasun-nw4 font-semibold">
                    Steal a rare cache of Spectra energy from the Dorakken Empire's vaults.
                  </p>
                  <p className="text-nasun-nw4 font-semibold">Or never see his daughter again.</p>
                </div>
              </div>

              {/* ACT II — The Alliance */}
              <div className="pl-5 border-l-2 border-nasun-nw3/70">
                <small className="block text-nasun-nw4/70 tracking-[0.3em] uppercase font-bold mb-4">
                  Act II — The Alliance
                </small>
                <p className="text-nasun-white/70 mb-4">
                  To survive the heist, Josen is forced into an uneasy alliance with:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <OuterBox color="nw1" padding="sm">
                    <h6 className="text-nasun-nw4 font-bold mb-2 tracking-wide uppercase">Senae</h6>
                    <p>A disciplined warrior whose loyalty comes at a cost.</p>
                  </OuterBox>
                  <OuterBox color="nw1" padding="sm">
                    <h6 className="text-nasun-nw4 font-bold mb-2 tracking-wide uppercase">
                      The Kid
                    </h6>
                    <p>
                      The most notorious criminal in the Gen Sol Galaxy… and the only person who
                      claims he's broken into an imperial vault and lived to tell the story.
                    </p>
                  </OuterBox>
                </div>
              </div>

              {/* ACT III — Thematic closing */}
              <div className="pl-5 border-l-2 border-nasun-nw3/70">
                <small className="block text-nasun-nw4/70 tracking-[0.3em] uppercase font-bold mb-4">
                  Act III — Buried Truths
                </small>
                <p className="text-nasun-white/70 ">
                  What begins as a rescue mission evolves into a battle of wills, loyalties, and
                  buried truths—culminating in a finale where Josen must choose between saving his
                  daughter and losing his humanity.
                </p>
              </div>
            </div>
          </section>

          {/* ========== CHARACTERS ========== */}
          <section>
            <SectionTitle as="h4">CHARACTERS</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <OuterBox color="nw1" padding="sm">
                <h6 className="text-nasun-nw4 font-bold mb-3 tracking-wide uppercase">Josen</h6>
                <p>
                  A farmer scarred by loss. His wife's death left him paralyzed by fear—fear that
                  has quietly fractured his relationship with Naro. Thrust into a violent
                  underworld, he must confront who he was—and what he's willing to become.
                </p>
              </OuterBox>
              <OuterBox color="nw1" padding="sm">
                <h6 className="text-nasun-nw4 font-bold mb-3 tracking-wide uppercase">Naro</h6>
                <p>
                  Intelligent, resilient, mature beyond her years. She dreams of traveling the stars
                  with her father, even as she carries her own grief. Her choice to hide things from
                  Josen, born from love rather than rebellion, becomes the catalyst for everything
                  that follows.
                </p>
              </OuterBox>
              <OuterBox color="nw1" padding="sm">
                <h6 className="text-nasun-nw4 font-bold mb-3 tracking-wide uppercase">Lashi</h6>
                <p>
                  Naro's loyal companion. Through Lashi, we see Naro's hopes, fears, and
                  imagination—warmth and light amid the growing darkness.
                </p>
              </OuterBox>
            </div>
          </section>

          {/* ========== THE GEN SOL GALAXY ========== */}
          <section>
            <SectionTitle as="h4">THE GEN SOL GALAXY</SectionTitle>
            <div className="bg-slate-900 border border-slate-700 backdrop-blur-lg rounded-sm shadow-lg px-4 md:px-6 lg:px-8 py-3 md:py-5 lg:py-7 space-y-4">
              <p className="text-nasun-nw4 font-medium">
                Lush frontier worlds. Oppressive imperial strongholds. Outlaw stations operating at
                the edges of the galaxy. Ancient technologies powered by Spectra energy. Every
                empire and planetary system preparing for the V Games.
              </p>
              <p className="text-nasun-white/70">
                The Heist introduces the Gen Sol universe—its factions, its dangers, and the power
                struggles that will shape future stories across films, games, and series.
              </p>
            </div>
          </section>
        </div>
      </SectionLayout>
    </>
  );
}

export default React.memo(TheHeistSection);
