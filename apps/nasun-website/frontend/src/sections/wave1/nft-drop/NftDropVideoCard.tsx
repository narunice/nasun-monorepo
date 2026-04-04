import { motion } from "framer-motion";

interface NftDropVideoCardProps {
  id: number;
  name: string;
  description: string;
  selected: boolean;
  onSelect: (id: number) => void;
  mintedCount?: number;
}

export function NftDropVideoCard({
  id,
  name,
  description,
  selected,
  onSelect,
  mintedCount = 0,
}: NftDropVideoCardProps) {
  return (
    <motion.button
      onClick={() => onSelect(id)}
      className={`
        group relative w-full rounded-2xl overflow-hidden text-left transition-all duration-300
        border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50
        ${
          selected
            ? "border-amber-400 shadow-[0_0_30px_rgba(249,168,36,0.15)]"
            : "border-white/[0.06] hover:border-white/[0.15]"
        }
      `}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      {/* Video placeholder */}
      <div className="aspect-[3/4] relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(
                ${135 + id * 25}deg,
                hsl(${200 + id * 20}, 25%, 8%) 0%,
                hsl(${210 + id * 15}, 30%, 14%) 50%,
                hsl(${220 + id * 10}, 20%, 10%) 100%
              )
            `,
          }}
        />

        {/* Placeholder visual */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-20 h-20 rounded-full opacity-20 group-hover:opacity-30 transition-opacity duration-500"
            style={{
              background: `radial-gradient(circle, hsl(${30 + id * 8}, 80%, 60%) 0%, transparent 70%)`,
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              className="text-white/20 group-hover:text-white/35 transition-colors duration-300"
            >
              <path
                d="M8 5.14v14l11-7-11-7z"
                fill="currentColor"
              />
            </svg>
          </div>
        </div>

        {/* Edition number */}
        <div className="absolute top-3 left-3">
          <span
            className="text-[10px] font-mono tracking-[0.2em] uppercase px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.4)",
              backdropFilter: "blur(8px)",
            }}
          >
            #{id}
          </span>
        </div>

        {/* Selection indicator */}
        {selected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-3 right-3 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12l5 5L20 7"
                stroke="#000"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.div>
        )}

        {/* Bottom gradient overlay */}
        <div
          className="absolute bottom-0 left-0 right-0 h-24"
          style={{
            background:
              "linear-gradient(to top, rgba(15,13,11,0.95) 0%, transparent 100%)",
          }}
        />
      </div>

      {/* Info */}
      <div className="p-4 pt-0 relative -mt-2">
        <h3
          className={`text-base font-semibold tracking-wide transition-colors duration-300 ${
            selected ? "text-amber-300" : "text-nasun-white/90 group-hover:text-nasun-white"
          }`}
        >
          {name}
        </h3>
        <p className="text-xs text-nasun-white/40 mt-0.5 leading-relaxed">
          {description}
        </p>
        {mintedCount > 0 && (
          <p className="text-[10px] text-nasun-white/25 mt-1.5 font-mono">
            {mintedCount.toLocaleString()} minted
          </p>
        )}
      </div>
    </motion.button>
  );
}
