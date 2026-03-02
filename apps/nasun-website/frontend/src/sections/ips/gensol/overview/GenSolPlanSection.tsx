import React from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { OuterBox } from "@/components/ui";

/**
 * GenSolPlanSection - Gen Sol Universe Overview Page (new content)
 *
 * Rendered above the legacy OverviewHeroSection in OverviewPage.
 * Source: 04C4-Ecosystem-Gen-Sol-Plan-03.md
 */
function GenSolPlanSection() {
  return (
    <SectionLayout className="!max-w-6xl">
      <div className="flex flex-col gap-10 md:gap-12 lg:gap-14">
        {/* ========== HERO ========== */}
        <section>
          <div className="flex flex-col items-center text-center">
            <PageTitle>GEN SOL</PageTitle>
            <h5 className="-mt-4 md:-mt-6 lg:-mt-8 font-medium">
              A Sci-Fi Universe Across Games, Animation, Film
            </h5>
          </div>
          <div className="mt-6 md:mt-8  space-y-4">
            <p className="">
              Gen Sol is a transmedia science fiction universe built around one question: <br />{" "}
              <strong>
                What would you sacrifice to control the galaxy's most powerful resource?
              </strong>
            </p>
            <p className="">
              Every story, across animation, live-action, games, and films, takes place in the Gen Sol
              Galaxy, where <span className="text-nasun-nw4 font-semibold">Spectra</span> fuels
              ships, weapons, and entire civilizations. Its power and scarcity turns desire into an
              obsession no one can escape.
            </p>
          </div>
        </section>

        {/* ========== THE STRUCTURE ========== */}
        <section>
          <SectionTitle as="h4">THE STRUCTURE</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <OuterBox color="noborder" padding="sm" className="!bg-nasun-c6">
              <h6 className="text-nasun-white font-bold mb-1 tracking-wide uppercase">
                The Fringes
              </h6>
              <small className="block text-nasun-nw4 tracking-widest uppercase mb-3">
                Animation series + Multiplayer shooter
              </small>
              <p>
                Outlaws, mercenaries, and anti-heroes fighting for survival on the galaxy's edge.
              </p>
            </OuterBox>
            <OuterBox color="noborder" padding="sm" className="!bg-nasun-c6">
              <h6 className="text-nasun-white font-bold mb-1 tracking-wide uppercase">
                The Politics
              </h6>
              <small className="block text-nasun-nw4 tracking-widest uppercase mb-3">
                Live-action series + Tournament games
              </small>
              <p>Empires, heirs, and power brokers scheming for dominance.</p>
            </OuterBox>
            <OuterBox color="noborder" padding="sm" className="!bg-nasun-c6">
              <h6 className="text-nasun-white font-bold mb-1 tracking-wide uppercase">
                The V Games
              </h6>
              <small className="block text-nasun-nw4 tracking-widest uppercase mb-3">
                Feature film trilogy + Flagship game
              </small>
              <p>
                The galaxy-defining competition for control of the Vertex Zone, the source of all
                Spectra.
              </p>
            </OuterBox>
          </div>
        </section>
        {/* ========== ANIMATION ========== */}
        <section>
          <SectionTitle as="h4">ANIMATION</SectionTitle>
          <div className="pl-5 border-l-2 border-nasun-nw3">
            <h5 className="font-bold text-nasun-white mb-1">The Heist</h5>
            <small className="block text-sm text-nasun-nw4 tracking-widest uppercase mb-4">
              8-Episode 3D Animated Series
            </small>
            <div className="space-y-3">
              <p>
                Josen is a farmer on a remote planet, raising his daughter Naro alone after his
                wife's death. When Naro is kidnapped by an alien syndicate, Josen receives an
                ultimatum: steal rare Spectra from the Dorakken Empire's vaults, or never see her
                again.
              </p>
              <p>
                To survive the heist, he's forced into an alliance with{" "}
                <span className="text-nasun-nw4 font-semibold">the Kid</span>, the galaxy's most
                infamous criminal.
              </p>
              <p className="  italic">
                A father's desperate rescue becomes a battle of wills, loyalties, and buried truths.
              </p>
            </div>
          </div>
        </section>
        {/* ========== LIVE-ACTION ========== */}
        <section>
          <SectionTitle as="h4">LIVE-ACTION</SectionTitle>
          <div className="pl-5 border-l-2 border-nasun-nw3">
            <h5 className="font-bold text-nasun-white mb-1">The Heir Apparent</h5>
            <small className="block text-sm text-nasun-nw4 tracking-widest uppercase mb-4">
              Streaming Series
            </small>
            <div className="space-y-3">
              <p>
                The Dorakken Empire has won 29 consecutive V Games, maintaining control of the
                Vertex Zone for decades. But the Emperor is dying from injuries sustained in the
                last competition.
              </p>
              <p>
                Three siblings, two brothers and a sister, wage a ruthless war for succession. Each
                believes they're destined not only to rule the empire, but to become the next
                legendary driver in the V Games.
              </p>
              <p className="  italic">
                The series exposes the political machinery, technology, and mysticism that govern
                the Gen Sol Galaxy, and the brutal cost of maintaining power.
              </p>
            </div>
          </div>
        </section>
        {/* ========== FILM ========== */}
        <section>
          <SectionTitle as="h4">FILM</SectionTitle>
          <div className="pl-5 border-l-2 border-nasun-nw3">
            <h5 className="font-bold text-nasun-white mb-1">The V Games Trilogy</h5>
            <div className="mt-4 space-y-3">
              <p>
                Moonoak, a poor kid from the galaxy's forgotten regions, rises to become one of the
                greatest mech drivers in V Games history.
              </p>
              <p className="">
                Her rise ignites an obsession in the true heir of the Dorakken Empire, forging a
                rivalry that reshapes the galaxy and culminates in the V Games themselves.
              </p>
            </div>
          </div>
        </section>
        {/* ========== GAMES ========== */}
        <section>
          <SectionTitle as="h4">GAMES</SectionTitle>
          <div className="space-y-10">
            {/* SPECTRA */}
            <div>
              <h5 className="font-bold text-nasun-white mb-1">SPECTRA</h5>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <small className="text-sm text-nasun-nw4 tracking-widest uppercase">
                  Multiplayer Sci-Fi Shooter
                </small>
                <span className="text-nasun-nw1 border border-nasun-nw1/50 px-2 py-px rounded-sm tracking-wider uppercase font-bold text-xs">
                  Alpha Live
                </span>
              </div>
              <p className="mb-4">
                Teams crash-land on hostile alien worlds and race to extract Spectra before the
                environment kills everyone. Built in Unreal Engine C++.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <OuterBox color="noborder" padding="sm" className="bg-nasun-nw3">
                  <small className="block text-white tracking-widest uppercase mb-3">
                    Current prototype includes:
                  </small>
                  <ul className="space-y-2">
                    {[
                      "Live multiplayer with dedicated servers",
                      "Multiple weapon classes and combat systems",
                      "Lag compensation and server-rewind",
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2  ">
                        <span className="text-nasun-nw1 shrink-0 mt-0.5">✅</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </OuterBox>
                <OuterBox color="noborder" padding="sm" className="bg-nasun-nw3">
                  <small className="block text-white tracking-widest uppercase mb-3">
                    In development:
                  </small>
                  <ul className="space-y-2">
                    {[
                      "Escape from Kramok map (8v8 objective mode)",
                      "Dorakken Guards and Raider factions",
                      "Team-based missions and ranked tournaments",
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2  ">
                        <span className="text-nasun-nw1 shrink-0 mt-0.5 text-xs">▶</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </OuterBox>
              </div>
            </div>

            {/* The V Games */}
            <div>
              <h5 className="font-bold text-nasun-white mb-1">The V Games</h5>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <small className="text-sm text-nasun-nw4 tracking-widest uppercase">
                  Flagship Competitive Game
                </small>
                <span className="text-nasun-nw4/60 border border-nasun-nw4/30 px-2 py-px rounded-sm tracking-wider uppercase font-bold text-xs">
                  In Development
                </span>
              </div>
              <p className="">
                Every three years, the V Games decide who controls the Vertex Zone. A galaxy-wide
                competition where elite drivers of giant mechs battle it out. Over time, narrative
                content and gameplay will converge toward the first feature film and a fully
                realized V Games tournament.
              </p>
            </div>
          </div>
        </section>
        {/* ========== PRODUCTION ========== */}
        <section>
          <SectionTitle as="h4">PRODUCTION</SectionTitle>
          <p className="">
            Gen Sol is being developed in collaboration with South Korean filmmakers, actors,
            writers, and gaming/animation studios.
          </p>
          <p className="">All content is primarily in English, designed for global audiences.</p>
        </section>
        {/* ========== STATUS ========== */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Currently in Production */}
            <div>
              <SectionTitle as="h4">CURRENTLY IN PRODUCTION</SectionTitle>
              <ul className="space-y-2">
                {[
                  { label: "SPECTRA", status: "Alpha Live" },
                  { label: "The Heist", status: "Pre-Production" },
                ].map(({ label, status }, i) => (
                  <li key={i} className="flex items-center gap-3  ">
                    <span className="text-nasun-nw1 shrink-0 mt-0.5">✅</span>
                    <span>
                      <span className="font-semibold">{label}</span>
                      <span className="text-nasun-white/50 ml-2">({status})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* What's Next */}
            <div>
              <SectionTitle as="h4">WHAT'S NEXT</SectionTitle>
              <div className="space-y-4">
                <div>
                  <small className="block text-nasun-nw4/80 tracking-widest uppercase font-bold mb-2">
                    2026
                  </small>
                  <ul className="space-y-1">
                    {[
                      "SPECTRA public playtests",
                      "The Heist animation production",
                      "The Heir Apparent series development",
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2  ">
                        <span className="text-nasun-nw1 shrink-0 mt-0.5 text-xs">▶</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <small className="block text-nasun-nw4/80 tracking-widest uppercase font-bold mb-2">
                    Beyond
                  </small>
                  <ul className="space-y-1">
                    {[
                      "V Games trilogy pre-production",
                      "Expanded multiplayer modes and maps",
                      "Tournament ecosystem and competitive play",
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2  ">
                        <span className="text-nasun-nw1 shrink-0 mt-0.5 text-xs">▶</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </SectionLayout>
  );
}

export default React.memo(GenSolPlanSection);
