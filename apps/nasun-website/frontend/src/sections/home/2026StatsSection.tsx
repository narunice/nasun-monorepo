import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { CountingNumber } from "@/components/ui/CountingNumber";
import { ButtonV4 } from "@/components/ui/button-v4";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HeroStatProps {
  value: React.ReactNode;
  label: string;
  sublabel?: string;
  accent?: "cyan" | "mint" | "teal";
  delay?: number;
  size?: "lg" | "sm";
}

// ─── Color maps ──────────────────────────────────────────────────────────────

const accentText = {
  cyan: "text-pado-3",
  mint: "text-pado-4",
  teal: "text-pado-2",
} as const;

// ─── Sub-components ──────────────────────────────────────────────────────────

const HeroStat = ({
  value,
  label,
  sublabel,
  accent = "cyan",
  delay = 0,
  size = "lg",
}: HeroStatProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-2 min-w-0 items-center text-center"
    >
      <div
        className={`${size === "lg" ? "text-5xl lg:text-6xl" : "text-3xl lg:text-4xl"} font-black tabular-nums leading-none tracking-tight ${accentText[accent]}`}
      >
        {value}
      </div>
      <div className="text-pd5 font-semibold text-sm uppercase tracking-widest mt-1">
        {label}
      </div>
      {sublabel && (
        <div className="text-pd4 text-sm font-medium">{sublabel}</div>
      )}
    </motion.div>
  );
};

const SectionChip = ({
  children,
  large = false,
  className = "",
}: {
  children: React.ReactNode;
  accent?: "cyan" | "mint" | "teal";
  large?: boolean;
  className?: string;
}) => (
  <span
    className={`inline-block font-black uppercase tracking-widest ${large ? "text-4xl lg:text-5xl" : "text-lg"} text-nasun-white ${className}`}
  >
    {children}
  </span>
);

// ─── Main section ─────────────────────────────────────────────────────────────

export const Hero2026StatsSection = () => {
  return (
    <section className="relative bg-pd0 min-h-screen flex items-center max-w-9xl mx-auto">
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-12 flex flex-col gap-14 lg:gap-16 -mt-[50px]">
        {/* Top: Nasun Devnet - full width */}
        <div>
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col items-center gap-4 mb-8"
          >
            <SectionChip
              accent="mint"
              large
              className="!font-eurostile font-semibold"
            >
              Nasun Devnet
            </SectionChip>
            <span className="text-pd3 text-sm mb-4">
              Launched{" "}
              <span className="text-pd4 font-semibold">March 4, 2026</span>
            </span>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-16 gap-y-8 justify-items-center">
            <HeroStat
              value="37k+"
              label="Peak Daily Active Addresses"
              sublabel="Apr 14, 2026"
              accent="mint"
              delay={0.15}
            />
            <HeroStat
              value={
                <>
                  <CountingNumber value="69" />.<CountingNumber value="6" />%
                </>
              }
              label="Avg Returning Rate"
              sublabel="46-day average"
              accent="mint"
              delay={0.25}
            />
            <HeroStat
              value={
                <>
                  <CountingNumber value="8785" />
                </>
              }
              label="Avg Daily Active Addresses"
              accent="mint"
              delay={0.35}
            />
          </div>
        </div>
        <div className=""></div>
        {/* Bottom row: Community (left) + Pado (right) */}
        <div className="flex flex-col lg:flex-row justify-around gap-14">
          {/* Nasun Community */}
          <div className="w-full">
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="flex flex-col items-center gap-2 mb-8"
            >
              <SectionChip accent="cyan" className="!text-xl">
                Nasun Community
              </SectionChip>
              <span className="text-pd3 text-sm">
                Launched{" "}
                <span className="text-pd4 font-semibold">March 4, 2026</span>
              </span>
            </motion.div>

            <div className="grid grid-cols-2 gap-8">
              <HeroStat
                value="96k+"
                label="Registered Users"
                accent="cyan"
                delay={0.15}
                size="sm"
              />
              <HeroStat
                value="10.5k+"
                label="Verified Wallets"
                sublabel="With one or more social accounts connected"
                accent="cyan"
                delay={0.25}
                size="sm"
              />
            </div>
          </div>

          <div className="hidden lg:block w-px bg-nasun-white/20 self-stretch" />

          {/* Pado Finance */}
          <div className="w-full">
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="flex flex-col items-center gap-2 mb-8"
            >
              <SectionChip accent="teal" className="!text-xl">
                Pado DeFi & Gaming
              </SectionChip>
              <span className="text-pd3 text-sm">
                Launched{" "}
                <span className="text-pd4 font-semibold">April 9, 2026</span>
              </span>
            </motion.div>

            <div className="grid grid-cols-2 gap-8">
              <HeroStat
                value={
                  <>
                    <CountingNumber value="4307" />
                  </>
                }
                label="Traders with social accounts connected"
                sublabel="Peak, Apr 14"
                accent="teal"
                delay={0.15}
                size="sm"
              />
              <HeroStat
                value={
                  <>
                    <CountingNumber value="5231" />
                  </>
                }
                label="Gamers with social accounts connected"
                sublabel="Peak, Apr 15"
                accent="teal"
                delay={0.25}
                size="sm"
              />
            </div>
          </div>
        </div>
        {/* View our activities */}
        <div className="flex flex-col items-center gap-6 pt-4">
          <span className="text-sm font-bold uppercase tracking-widest text-pd4">
            View our activities
          </span>
          <div className="flex gap-4 mb-4">
            <div className="flex w-full ">
              <ButtonV4
                asChild
                color="ghost"
                size="sm"
                className="uppercase tracking-widest"
              >
                <Link to="/community/nasun-ecosystem-leaderboard">
                  Ecosystem Leaderboard
                </Link>
              </ButtonV4>
            </div>
            <div className="flex w-full">
              <ButtonV4
                asChild
                color="ghost"
                size="sm"
                className="uppercase tracking-widest"
              >
                <Link to="/community/pado-leaderboard">
                  Pado DeFi Leaderboard
                </Link>
              </ButtonV4>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero2026StatsSection;
