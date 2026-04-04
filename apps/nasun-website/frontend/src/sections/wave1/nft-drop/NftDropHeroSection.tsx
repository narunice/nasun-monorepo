import { motion } from "framer-motion";

export function NftDropHeroSection() {
  return (
    <section className="relative w-full overflow-hidden pt-16 pb-12 sm:pt-24 sm:pb-16 lg:pt-32 lg:pb-20">
      {/* Background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% 0%, rgba(249,168,36,0.06) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 20%, rgba(68,139,187,0.04) 0%, transparent 50%),
            linear-gradient(180deg, rgba(15,13,11,1) 0%, rgba(20,18,16,1) 100%)
          `,
        }}
      />

      {/* Subtle grid lines */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Overline */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-[11px] sm:text-xs font-mono tracking-[0.3em] uppercase text-amber-400/60 mb-4"
        >
          Nasun Network
        </motion.p>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight"
          style={{
            background: "linear-gradient(135deg, #faf7f4 0%, #f9a824 50%, #faf7f4 100%)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Genesis Pass
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="mt-4 sm:mt-6 text-nasun-white/50 text-sm sm:text-base lg:text-lg max-w-xl mx-auto leading-relaxed"
        >
          7 unique video editions. Choose your mark on the genesis of Nasun.
          <br className="hidden sm:block" />
          Each pass grants founding access to the Nasun ecosystem.
        </motion.p>

        {/* Decorative line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mt-8 sm:mt-10 mx-auto w-16 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent"
        />
      </div>
    </section>
  );
}
