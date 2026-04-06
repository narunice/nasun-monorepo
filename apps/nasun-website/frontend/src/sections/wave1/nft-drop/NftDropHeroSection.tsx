import { motion } from "framer-motion";
import { PageTitle } from "@/components/ui/PageTitle";

export function NftDropHeroSection() {
  return (
    <section className="relative w-full overflow-hidden pt-24 pb-16 sm:pt-32 sm:pb-20 lg:pt-40 lg:pb-28">
      {/* Cinematic background with golden atmosphere */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% 0%, rgba(249,168,36,0.12) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 30% 20%, rgba(249,168,36,0.05) 0%, transparent 50%),
            radial-gradient(ellipse 50% 40% at 75% 15%, rgba(68,139,187,0.04) 0%, transparent 50%),
            linear-gradient(180deg, rgba(25,22,21,1) 0%, rgba(31,28,26,1) 100%)
          `,
        }}
      />

      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(249,168,36,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(249,168,36,0.5) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Overline */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-sm font-mono tracking-[0.3em] uppercase text-amber-400 mb-6"
        >
          Nasun Network
        </motion.p>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <PageTitle
            as="h1"
            align="center"
            wrapperClassName=""
            className=" text-5xl sm:text-6xl lg:text-8xl tracking-widest leading-none"
            style={{
              background:
                "linear-gradient(135deg, #faf7f4 0%, #f9a824 50%, #faf7f4 100%)",
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            <span className="font-bold !font-changeling">GENESIS</span>{" "}
            <span className="font-medium !font-changeling">PASS</span>
          </PageTitle>
        </motion.div>
        <div className="max-w-[620px] mx-auto">
          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mt-6 sm:mt-8 text-nasun-white/80 text-base sm:text-lg lg:text-xl max-w-2xl mx-auto leading-relaxed"
          >
            A mysterious pentahedron appears across time and space, disrupting
            systems that concentrate power into the hands of a few.
            <br className="hidden sm:block" />
            Its presence creates new timelines where communities,{" "}
            <br className="hidden sm:block" />
            not individuals, shape powerful civilizations.
          </motion.p>
        </div>

        {/* Decorative line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mt-10 sm:mt-14 mx-auto w-32 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent"
        />
      </div>
    </section>
  );
}
