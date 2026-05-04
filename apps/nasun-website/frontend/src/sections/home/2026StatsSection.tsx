import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { CountingNumber } from "@/components/ui/CountingNumber";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HeroStatProps {
  value: React.ReactNode;
  label: string;
  sublabel?: React.ReactNode;
  delay?: number;
  size?: "lg" | "sm";
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const HeroStat = ({
  value,
  label,
  sublabel,
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
        className={`${
          size === "lg"
            ? "text-4xl sm:text-5xl lg:text-6xl"
            : "text-3xl lg:text-4xl"
        } font-black tabular-nums leading-none tracking-tight text-white`}
      >
        {value}
      </div>
      <div className="text-white/90 font-semibold text-xs sm:text-sm uppercase tracking-wider sm:tracking-widest mt-2 px-1">
        {label}
      </div>
      {sublabel && (
        <div className="text-white/70 text-xs sm:text-sm font-medium px-1 mt-1">
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
  large?: boolean;
  className?: string;
}) => (
  <span
    className={`inline-block text-center font-black uppercase tracking-wider sm:tracking-widest ${
      large
        ? "text-3xl leading-tight sm:text-4xl lg:text-5xl"
        : "text-xl sm:text-2xl"
    } text-white ${className}`}
  >
    {children}
  </span>
);

// ─── Main section ─────────────────────────────────────────────────────────────

export const Hero2026StatsSection = () => {
  return (
    <section className="relative bg-pd0 min-h-[calc(100vh-50px)] max-w-9xl mx-auto py-16 sm:py-20 lg:py-24 flex flex-col justify-center">
      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 lg:px-12 flex flex-col gap-24 lg:gap-32">
        {/* Top: NASUN DEVNET */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center gap-2 mb-12"
          >
            <SectionChip large className="!font-eurostile font-semibold">
              NASUN DEVNET
            </SectionChip>
            <span className="text-white/65 text-sm tracking-widest uppercase">
              Launched{" "}
              <span className="text-white/85 font-semibold">March 4, 2026</span>
            </span>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 lg:gap-x-24 gap-y-12 justify-items-center max-w-4xl mx-auto">
            <HeroStat
              value={<CountingNumber value="8,785" />}
              label="Daily Active Addresses"
              sublabel="45-day average (Mar 4 – Apr 22)"
              delay={0.1}
            />
            <HeroStat
              value={
                <>
                  <CountingNumber value="69" />.<CountingNumber value="6" />%
                </>
              }
              label="Returning Addresses"
              sublabel="45-day average (Mar 4 – Apr 22)"
              delay={0.2}
            />
          </div>
        </div>

        {/* Bottom: LIVE ACTIVITY */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center gap-2 mb-12"
          >
            <SectionChip large className="!font-eurostile font-semibold">
              LIVE ACTIVITY
            </SectionChip>
            <span className="text-white/65 text-sm tracking-widest uppercase">
              <span className="text-white/85 font-semibold">10.5k+</span> Users
              with social accounts
            </span>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 lg:gap-x-12 gap-y-12 justify-items-center">
            <HeroStat
              value={<CountingNumber value="5,734" />}
              label="Daily Active Users"
              sublabel={
                <>
                  with social accounts
                  <br />
                  7-day avg (Apr 16 – 22)
                </>
              }
              delay={0.1}
              size="sm"
            />
            <HeroStat
              value={<CountingNumber value="2,377" />}
              label="Active Traders"
              sublabel={
                <>
                  with social accounts
                  <br />
                  7-day avg (Apr 16 – 22)
                </>
              }
              delay={0.2}
              size="sm"
            />
            <HeroStat
              value={<CountingNumber value="3,347" />}
              label="Active Gamers"
              sublabel={
                <>
                  with social accounts
                  <br />
                  7-day avg (Apr 16 – 22)
                </>
              }
              delay={0.3}
              size="sm"
            />
          </div>
        </div>

        {/* Footer Note */}
        <div className="pt-8 border-t border-white/20 max-w-4xl mx-auto w-full">
          <p className="text-white/80 text-xs sm:text-sm leading-relaxed px-6 sm:px-12">
            Users participate across multiple activities. <br />
            Bot mitigation and social verification measures in place. On-chain
            activity is publicly verifiable.
          </p>
        </div>
      </div>
    </section>
  );
};

export default Hero2026StatsSection;
