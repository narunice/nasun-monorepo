import { motion } from "framer-motion";
import { useRef, useState } from "react";

interface NftDropVideoCardProps {
  id: number;
  name: string;
  selected: boolean;
  onSelect: (id: number) => void;
  mintedCount?: number;
  compact?: boolean;
}

export function NftDropVideoCard({
  id,
  name,
  selected,
  onSelect,
  mintedCount = 0,
  compact = false,
}: NftDropVideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);

  const handleMouseEnter = () => {
    videoRef.current?.play().catch(() => {});
  };

  const handleMouseLeave = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <motion.button
      onClick={() => onSelect(id)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`
        group relative w-full rounded-2xl overflow-hidden text-left transition-all duration-300
        border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50
        ${
          selected
            ? "border-amber-400 shadow-[0_0_40px_rgba(249,168,36,0.2)]"
            : "border-white/[0.08] hover:border-white/[0.2]"
        }
      `}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      {/* Video / poster visual */}
      <div className="aspect-square relative overflow-hidden">
        {/* Poster image as base layer */}
        <img
          src="/videos/genesis-pass-poster.webp"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            filter: `hue-rotate(${id * 15}deg) saturate(${0.8 + id * 0.1})`,
          }}
        />

        {/* Video overlay on hover */}
        <video
          ref={videoRef}
          src="/videos/Founders-Nft-Portal-Rotate-rf28.mp4"
          muted
          loop
          playsInline
          preload="none"
          onLoadedData={() => setVideoLoaded(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
            videoLoaded ? "opacity-0 group-hover:opacity-100" : "opacity-0"
          }`}
        />

        {/* Edition number badge */}
        <div
          className={`absolute z-10 ${compact ? "top-0.5 left-1 sm:top-3 sm:left-3" : "top-3 left-3"}`}
        >
          <span
            className={`font-mono tracking-wider uppercase rounded-lg ${
              compact
                ? "text-[10px] px-1.5 py-0.5 sm:text-sm sm:px-2.5 sm:py-1"
                : "text-sm px-2.5 py-1"
            }`}
            style={{
              background: "rgba(0,0,0,0.5)",
              color: "rgba(255,255,255,0.8)",
              backdropFilter: "blur(8px)",
            }}
          >
            #{id}
          </span>
        </div>

        {/* Bottom gradient for text legibility (hidden on mobile for compact cards) */}
        <div
          className={`absolute bottom-0 left-0 right-0 h-28 ${compact ? "hidden sm:block" : ""}`}
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)",
          }}
        />

        {/* Compact: title overlaid on image (desktop only) */}
        {compact && (
          <div className="absolute bottom-3 left-3 right-3 z-10 hidden sm:block">
            <h3
              className={`text-sm font-semibold tracking-wide ${
                selected ? "text-amber-300" : "text-nasun-white/90"
              }`}
            >
              {name}
            </h3>
          </div>
        )}
      </div>

      {/* Full: card info below image */}
      {!compact && (
        <div className="p-4 pt-0 relative -mt-3">
          <h3
            className={`text-base font-semibold tracking-wide transition-colors duration-300 ${
              selected
                ? "text-amber-300"
                : "text-nasun-white/90 group-hover:text-nasun-white"
            }`}
          >
            {name}
          </h3>
          {mintedCount > 0 && (
            <p className="text-sm text-nasun-white/70 mt-1.5 font-mono">
              {mintedCount.toLocaleString()} minted
            </p>
          )}
        </div>
      )}
    </motion.button>
  );
}
