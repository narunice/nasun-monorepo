import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { CountingNumber } from "@/components/ui/CountingNumber";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HeroStatProps {
  value: React.ReactNode;
  label: string;
  sublabel?: React.ReactNode;
  accent?: "cyan" | "mint" | "teal" | "lime" | "violet";
  delay?: number;
  size?: "lg" | "sm";
}

// ─── Color maps ──────────────────────────────────────────────────────────────

const accentText = {
  cyan: "text-pado-3",
  mint: "text-pado-4",
  teal: "text-pado-2",
  lime: "text-pado-5",
  violet: "text-pado-violet",
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
      className="flex flex-col gap-0.5 min-w-0 items-center text-center"
    >
      <div
        className={`${size === "lg" ? "text-4xl sm:text-5xl lg:text-6xl" : "text-3xl lg:text-4xl"} font-black tabular-nums leading-none tracking-tight ${accentText[accent]}`}
      >
        {value}
      </div>
      <div className="text-pd5 font-semibold text-xs sm:text-sm uppercase tracking-wider sm:tracking-widest mt-1 px-1">
        {label}
      </div>
      {sublabel && (
        <div className="text-pd4 text-xs sm:text-sm font-medium px-1">
          {sublabel}
        </div>
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
  accent?: "cyan" | "mint" | "teal" | "lime" | "violet";
  large?: boolean;
  className?: string;
}) => (
  <span
    className={`inline-block text-center font-black uppercase tracking-wider sm:tracking-widest ${large ? "text-3xl leading-tight sm:text-4xl lg:text-5xl" : "text-base sm:text-lg"} text-nasun-white ${className}`}
  >
    {children}
  </span>
);

// ─── Main section ─────────────────────────────────────────────────────────────

export const Hero2026StatsSection = () => {
  return (
    <section className="relative bg-pd0 min-h-[calc(100vh-50px)] max-w-9xl mx-auto py-16 sm:py-20 lg:py-16">
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-12 flex flex-col gap-14 lg:gap-16">
        {/* Top: Nasun Devnet - full width */}
        <div>
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col items-center gap-2 mb-8"
          >
            <SectionChip
              accent="mint"
              large
              className="!font-eurostile font-semibold"
            >
              Nasun
              <br className="sm:hidden" /> Devnet
            </SectionChip>
            <span className="text-pd3 text-sm mb-4">
              Launched{" "}
              <span className="text-pd4 font-semibold">March 4, 2026</span>
            </span>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 lg:gap-x-16 gap-y-10 justify-items-center">
            <HeroStat
              value={<CountingNumber value="37k+" />}
              label="Peak Daily Active Addresses"
              accent="mint"
              delay={0.15}
            />

            <HeroStat
              value={
                <>
                  <CountingNumber value="8,785" />
                </>
              }
              label="Avg Daily Active Addresses"
              sublabel="45-day average"
              accent="mint"
              delay={0.35}
            />
            <HeroStat
              value={
                <>
                  <CountingNumber value="69" />.<CountingNumber value="6" />%
                </>
              }
              label="Avg Returning Rate"
              sublabel="45-day average"
              accent="mint"
              delay={0.25}
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
              className="flex flex-col items-center gap-1 mb-8"
            >
              <SectionChip accent="cyan" className="!text-2xl">
                Nasun Community
              </SectionChip>
              <span className="text-pd3 text-sm">
                Launched{" "}
                <span className="text-pd4 font-semibold">March 4, 2026</span>
              </span>
            </motion.div>

            <div className="grid grid-cols-2 gap-4 sm:gap-8">
              <HeroStat
                value={
                  <>
                    <CountingNumber value="10" />.
                    <CountingNumber value="5k+" />
                  </>
                }
                label="Verified Users"
                sublabel="Connected with social accounts"
                accent="cyan"
                delay={0.15}
                size="sm"
              />
              <HeroStat
                value={<CountingNumber value="5,734" />}
                label="Daily Active Users"
                sublabel={
                  <>
                    Connected with social accounts
                    <br />
                    7-day avg (Apr 16-22)
                  </>
                }
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
              className="flex flex-col items-center gap-1 mb-8"
            >
              <SectionChip accent="teal" className="!text-2xl">
                Pado DeFi & Gaming
              </SectionChip>
              <span className="text-pd3 text-sm">
                Launched{" "}
                <span className="text-pd4 font-semibold">April 9, 2026</span>
              </span>
            </motion.div>

            <div className="grid grid-cols-2 gap-4 sm:gap-8">
              <HeroStat
                value={
                  <>
                    <CountingNumber value="2,377" />
                  </>
                }
                label="Daily Active Traders"
                sublabel={
                  <>
                    Connected with social accounts
                    <br />
                    7-day avg (Apr 16-22)
                  </>
                }
                accent="teal"
                delay={0.15}
                size="sm"
              />
              <HeroStat
                value={
                  <>
                    <CountingNumber value="3,347" />
                  </>
                }
                label="Daily Active Gamers"
                sublabel={
                  <>
                    Connected with social accounts
                    <br />
                    7-day avg (Apr 16-22)
                  </>
                }
                accent="teal"
                delay={0.25}
                size="sm"
              />
            </div>
          </div>
        </div>
        {/* Web Apps — accent: "lime" | "violet" */}
        <div>
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col items-center gap-1 mb-8"
          >
            <SectionChip accent="cyan" className="!text-2xl">
              Web Apps
            </SectionChip>
            <span className="text-pd3 text-sm">
              Launched{" "}
              <span className="text-pd4 font-semibold">March 4, 2026</span>
            </span>
          </motion.div>
          <div className="md:px-10 grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 justify-items-center">
            <HeroStat
              value={
                <>
                  <CountingNumber value="78" />.<CountingNumber value="1k" />
                </>
              }
              label="Visits"
              sublabel="Apr 16-22"
              accent="lime"
              delay={0.1}
              size="sm"
            />

            <HeroStat
              value={
                <>
                  <CountingNumber value="11" />%
                </>
              }
              label="Bounce Rate"
              sublabel="7-day avg (Apr 16-22)"
              accent="lime"
              delay={0.3}
              size="sm"
            />
            <HeroStat
              value={
                <>
                  <CountingNumber value="13" />m <CountingNumber value="13" />s
                </>
              }
              label="Visit Duration"
              sublabel="7-day avg (Apr 16-22)"
              accent="lime"
              delay={0.4}
              size="sm"
            />
          </div>
        </div>
        {/* Footnotes */}
        <div className="flex flex-col gap-1.5 pt-2 border-t border-nasun-white/15">
          <p className="text-pd4 text-sm leading-relaxed">
            <sup>1</sup> Nasun web apps are bot-filtered by Cloudflare
            Turnstile.
          </p>
          <p className="text-pd4 text-sm leading-relaxed">
            <sup>2</sup> Users with connected social accounts are linked with
            verified X, Google, and/or Telegram accounts.
          </p>
          <p className="text-pd4 text-sm leading-relaxed">
            <sup>3</sup> Bounce rate and visit duration are sourced from Umami
            Analytics. All on-chain data is independently verifiable.
          </p>
        </div>
      </div>
    </section>
  );
};

export default Hero2026StatsSection;
