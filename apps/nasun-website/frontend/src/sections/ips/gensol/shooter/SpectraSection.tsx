import React from "react";
import {
  Ghost,
  Crown,
  Crosshair,
  CheckCircle2,
  Wrench,
  Gamepad2,
  ShieldCheck,
  Timer,
  Server,
  Wifi,
  Box,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DividerBox } from "@/components/ui/DividerBox";
import { OuterBox } from "@/components/ui";
const progressVideo = "/videos/Opensea-Battalion-Nft-Pipeline-rf26.mp4";

/**
 * SpectraSection - Unified Spectra Game Page
 *
 * All content from HeroSection, FeaturesSection, DevelopmentSection, ResourcesSection
 * merged into a single component with consistent spacing per design convention.
 */
function SpectraSection() {
  const { t } = useTranslation("spectra");

  return (
    <SectionLayout className="!max-w-6xl">
      <div className="flex flex-col gap-10 md:gap-12 lg:gap-14">
        {/* ========== HERO ========== */}
        <div className="flex flex-col items-center text-center">
          <PageTitle>{t("pageTitle")}</PageTitle>
          <h5 className="-mt-4 md:-mt-6 lg:-mt-8 font-medium">{t("tagline")}</h5>

          {/* Gameplay Video */}
          <div className="mt-2 md:mt-4 lg:mt-6">
            <video
              src={progressVideo}
              autoPlay
              loop
              muted
              playsInline
              controls
              className="w-full rounded-lg"
            />

            {/* Hero Description */}
            <p className="text-center text-nasun-white/60 py-2 md:py-4">{t("heroDescription")}</p>
          </div>
        </div>

        {/* ========== GAME OVERVIEW ========== */}

        {/* The Core Loop */}
        <section>
          <SectionTitle as="h4">THE CORE LOOP</SectionTitle>
          <h5 className="font-normal text-nasun-white/80 mb-0 md:mb-1 lg:mb-2">
            Crash. Compete. Escape—or perish.
          </h5>
          <div className="space-y-3">
            <p>
              Your team crash-lands on a hostile alien world. Spectra—the galaxy's fuel source—is
              scattered across the wreckage. Both factions race to extract enough to power an escape
              ship.
            </p>
            <p>
              But the planet is collapsing. Lava eruptions intensify. Earthquakes tear the ground
              apart. Hostile parasites latch on. Delay too long and the environment kills everyone,
              regardless of who's winning.
            </p>
            <p>
              Victory requires combat, timing, and risk management. Carrying extra Spectra increases
              your rewards—but slows your escape as the world violently falls apart.
            </p>
          </div>
        </section>

        {/* Escape from Kramok */}
        <section>
          <OuterBox color="w1" padding="lg" className="!bg-[#2a2a2a] relative">
            <div className="absolute top-5 right-5 flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap bg-nasun-c1/20 text-nasun-c1">
                TPS
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap bg-nasun-c1/20 text-nasun-c1">
                PvPvE
              </span>
            </div>
            <div className="mb-4">
              <h4 className="!font-rubik uppercase font-medium text-xl md:text-2xl lg:text-3xl">
                ESCAPE FROM KRAMOK
                <span className="text-base md:text-lg lg:text-xl text-nasun-white/50 font-normal ml-3">
                  — Map 1
                </span>
              </h4>
            </div>
            <div className="space-y-4">
              <p className="text-nasun-white/90 font-medium">
                An unstable lava planet moments from destruction.
              </p>
              <p>
                <span className="font-semibold">Dorakken Empire</span> transport crashes after a{" "}
                <span className="font-semibold">Raider</span> ambush. Both factions fight over the
                wreckage as the planet tears itself apart:
              </p>
              <ul className="space-y-2 py-4">
                {[
                  "Volcanic eruptions",
                  "Earthquake fissures carve new paths",
                  "Hostile Mugox creatures swarm the battlefield",
                  "Match ends when planet collapses",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-nasun-white/80">
                    <span className="text-nasun-c1 mt-0.5 shrink-0 text-xs">▶</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="font-semibold">
                First team to fuel their escape ship survives. Everyone else burns.
              </p>
            </div>
          </OuterBox>
        </section>

        {/* Death Isn't the End */}
        <section>
          <SectionTitle as="h4">DEATH ISN'T THE END</SectionTitle>
          <p className="mb-4">
            Die and you return as a <span className="font-semibold">Phantom</span>—an invisible
            ghost in first-person view.
          </p>
          <DividerBox
            color="c1"
            padding="sm"
            className="!bg-black/30"
            title="Phantom System"
            icon={<Ghost className="w-5 h-5" />}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="font-semibold my-3">As a Phantom you can:</p>
                <ul className="space-y-2">
                  {[
                    "Move unseen through the battlefield",
                    "Manipulate Mugox hordes to attack enemies",
                    "Hunt and destroy rival Phantoms",
                    "Sabotage enemy movements and plans",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-nasun-white/80">
                      <span className="text-nasun-c1 shrink-0 mt-0.5">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-semibold my-3">You cannot:</p>
                <ul className="space-y-2">
                  {["Directly attack living players", "Be seen by the living"].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-nasun-white/80">
                      <span className="text-nasun-white/50 shrink-0 mt-0.5">✗</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </DividerBox>
          <p className="mt-4">
            Death becomes a tactical role. Every fallen player reshapes the match from the shadows.
          </p>
        </section>

        {/* Competitive Depth */}
        <section>
          <SectionTitle as="h4">COMPETITIVE DEPTH</SectionTitle>
          <div className="space-y-4">
            <p>Matches reward:</p>
            <ul className="space-y-2">
              {[
                "Team coordination and role assignment",
                "Spectra load balancing (speed vs. greed)",
                "Environmental awareness (lava patterns, collapse timing)",
                "Weapon loadouts and positioning",
                "Phantom interference and counter-play",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-nasun-white/80">
                  <span className="text-nasun-c1 mt-0.5 shrink-0 text-xs">▶</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-nasun-white/90 font-medium">
              Carry only what you need to escape—or risk it all for maximum Spectra and higher
              rewards.
            </p>
          </div>
        </section>

        {/* Factions & Conflict */}
        <section>
          <SectionTitle as="h4">FACTIONS & CONFLICT</SectionTitle>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DividerBox
                color="w4"
                hideDivider
                padding="sm"
                title="Dorakken Empire"
                icon={<Crown className="w-5 h-5" />}
                className="h-full"
              >
                <p>
                  Controls the primary Spectra zones across the galaxy. Militarized. Disciplined.
                  Ruthless in defending their monopoly.
                </p>
              </DividerBox>
              <DividerBox
                color="w4"
                hideDivider
                padding="sm"
                title="Raiders"
                icon={<Crosshair className="w-5 h-5" />}
                className="h-full"
              >
                <p>
                  Insurgents and pirates who steal and weaponize Spectra. Fast. Aggressive. Willing
                  to risk everything.
                </p>
              </DividerBox>
            </div>
            <p>
              Neutral worlds like Kramok become battlegrounds where both sides fight for
              survival—and neither is guaranteed to escape.
            </p>
          </div>
        </section>

        {/* Progression & Tournaments */}
        <section>
          <SectionTitle as="h4">PROGRESSION & TOURNAMENTS</SectionTitle>
          <div className="space-y-4">
            <p className="font-medium">Competitive ranked play and tournaments coming.</p>
            <p>As you progress:</p>
            <ul className="space-y-2">
              {[
                "Unlock rare Spectra variants (enhanced strength, speed, healing)",
                "Access advanced weapons, armor, and equipment",
                "Compete in high-stakes Arena matches with pooled rewards",
                "Enter faction wars that shape the Gen Sol universe",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-nasun-white/80">
                  <span className="text-nasun-c1 mt-0.5 shrink-0 text-xs">▶</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Optional Ownership */}
        <section>
          <SectionTitle as="h4">OPTIONAL OWNERSHIP</SectionTitle>
          <div className="space-y-4">
            <p className="text-nasun-white/90 font-medium">Web3 features are entirely optional.</p>
            <p>If you want:</p>
            <ul className="space-y-2">
              {[
                "Excess Spectra retained as tradeable assets",
                "Weapons and cosmetics you actually own (not locked to servers)",
                "Tournament rewards you can trade or keep",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-nasun-c1 shrink-0 mt-0.5">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p>You can. If you just want to play the game, nothing changes.</p>
          </div>
        </section>

        {/* What's Live Now */}
        <section>
          <SectionTitle as="h4">WHAT'S LIVE NOW</SectionTitle>
          <div className="space-y-8">
            {/* Playable */}
            <div>
              <p className="text-emerald-400 font-medium text-lg mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Alpha Prototype (Playable)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  "Dedicated servers running on AWS GameLift",
                  "Networked combat with multiple weapon classes",
                  "Full animation and effects pipeline",
                  "Battle Royale test mode",
                ].map((item, i) => (
                  <div
                    key={i}
                    className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4"
                  >
                    <p className="text-nasun-white font-medium text-sm md:text-base">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* In Development */}
            <div>
              <p className="text-amber-400 font-medium text-lg mb-4 flex items-center gap-2">
                <Wrench className="w-5 h-5" />
                In Development
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  "Kramok lava planet environment",
                  "Dorakken Guards and Raider characters",
                  "Team mission objectives and match flow",
                  "Production HUD and menu systems",
                ].map((item, i) => (
                  <div key={i} className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
                    <p className="text-nasun-white font-medium text-sm md:text-base">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Target */}
            <p className="text-nasun-white/90 font-semibold">
              Target: Q3-4 2026 — Public playtests on Escape from Kramok
            </p>
          </div>
        </section>

        {/* Technical Foundation */}
        <section>
          <SectionTitle as="h4">TECHNICAL FOUNDATION</SectionTitle>
          <div className="space-y-6">
            <p>Built for competitive fairness and scale:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  icon: <Gamepad2 className="w-5 h-5" />,
                  title: "Unreal Engine 5",
                  bullets: [
                    "C++ codebase with full source access",
                    "Production-grade rendering and physics",
                  ],
                },
                {
                  icon: <ShieldCheck className="w-5 h-5" />,
                  title: "Server-Authoritative",
                  bullets: [
                    "Health, damage, ammo verified server-side",
                    "No client-side trust for competitive integrity",
                  ],
                },
                {
                  icon: <Timer className="w-5 h-5" />,
                  title: "Lag Compensation",
                  bullets: [
                    "Client-side prediction for responsive input",
                    "Server rewind for accurate hit detection",
                  ],
                },
                {
                  icon: <Server className="w-5 h-5" />,
                  title: "AWS GameLift",
                  bullets: [
                    "Auto-scaling dedicated servers",
                    "Low-latency matchmaking infrastructure",
                  ],
                },
                {
                  icon: <Wifi className="w-5 h-5" />,
                  title: "Network-Optimized",
                  bullets: [
                    "Bandwidth-efficient replication",
                    "Designed for competitive tick rates",
                  ],
                },
                {
                  icon: <Box className="w-5 h-5" />,
                  title: "3D Art Pipeline",
                  bullets: [
                    "Characters, weapons, environments built in-house",
                    "Custom animations and VFX pipeline",
                  ],
                },
              ].map((card, i) => (
                <DividerBox
                  key={i}
                  color="w4"
                  hideDivider
                  padding="sm"
                  title={card.title}
                  icon={card.icon}
                  className="h-full"
                >
                  <ul className="space-y-1.5">
                    {card.bullets.map((bullet, j) => (
                      <li key={j} className="flex items-start gap-2 text-nasun-white/80 text-sm">
                        <span className="text-nasun-c1 shrink-0 mt-0.5 text-xs">•</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </DividerBox>
              ))}
            </div>
            <p>
              This isn't a blockchain game with a shooter attached. It's a competitive multiplayer
              shooter that happens to support ownership.
            </p>
          </div>
        </section>

        {/* Battalion NFT → Alpha Funding */}
        <section>
          <SectionTitle as="h4">BATTALION NFT → ALPHA FUNDING</SectionTitle>
          <div className="space-y-4">
            <p>The Battalion NFT sale will fund:</p>
            <ul className="space-y-2">
              {[
                "Core multiplayer infrastructure",
                "Weapons, characters, and gameplay systems",
                "Dedicated server architecture",
                "Community playtests and iteration",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-nasun-white/80">
                  <span className="text-nasun-c1 mt-0.5 shrink-0 text-xs">▶</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="font-medium">
              Battalion holders get early access and become the first players in the Gen Sol
              universe.
            </p>
          </div>
        </section>

        {/* What's Next */}
        <section>
          <SectionTitle as="h4">WHAT'S NEXT</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DividerBox
              color="c1"
              hideDivider
              padding="sm"
              title="Immediate (2026)"
              className="h-full !bg-black/30"
            >
              <ul className="space-y-2">
                {[
                  "Complete Escape from Kramok map",
                  "Public playtests and iteration",
                  "Additional modes (Team Deathmatch, Capture the Flag)",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-nasun-white/80">
                    <span className="text-nasun-c1 shrink-0 mt-0.5 text-xs">▶</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </DividerBox>
            <DividerBox
              color="c1"
              hideDivider
              padding="sm"
              title="Beyond Alpha"
              className="h-full !bg-black/30"
            >
              <ul className="space-y-2">
                {[
                  "Expanded player counts",
                  "Advanced Phantom mechanics",
                  "New maps and faction conflicts",
                  "Cinematic story integration with Gen Sol films and shows",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-nasun-white/80">
                    <span className="text-nasun-c1 shrink-0 mt-0.5 text-xs">▶</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </DividerBox>
          </div>
        </section>


      </div>
    </SectionLayout>
  );
}

export default React.memo(SpectraSection);
