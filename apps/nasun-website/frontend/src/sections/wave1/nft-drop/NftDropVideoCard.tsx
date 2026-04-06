import { motion } from "framer-motion";
import { useRef, useState } from "react";

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
      <div className="aspect-[3/4] relative overflow-hidden">
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
        <div className="absolute top-3 left-3 z-10">
          <span
            className="text-sm font-mono tracking-wider uppercase px-2.5 py-1 rounded-lg"
            style={{
              background: "rgba(0,0,0,0.5)",
              color: "rgba(255,255,255,0.8)",
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
            className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center shadow-lg"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
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

        {/* Bottom gradient for text legibility */}
        <div
          className="absolute bottom-0 left-0 right-0 h-28"
          style={{
            background:
              "linear-gradient(to top, rgba(15,13,11,0.95) 0%, rgba(15,13,11,0.6) 50%, transparent 100%)",
          }}
        />
      </div>

      {/* Card info */}
      <div className="p-4 pt-0 relative -mt-3">
        <h3
          className={`text-base font-semibold tracking-wide transition-colors duration-300 ${
            selected ? "text-amber-300" : "text-nasun-white/90 group-hover:text-nasun-white"
          }`}
        >
          {name}
        </h3>
        <p className="text-sm text-nasun-white/70 mt-1 leading-relaxed">
          {description}
        </p>
        {mintedCount > 0 && (
          <p className="text-sm text-nasun-white/70 mt-1.5 font-mono">
            {mintedCount.toLocaleString()} minted
          </p>
        )}
      </div>
    </motion.button>
  );
}
