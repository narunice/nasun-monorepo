import { FC, useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { NFT_EDITIONS } from "@/constants/nft-drop";
import { NftDropVideoCard } from "./NftDropVideoCard";

const TOTAL = NFT_EDITIONS.length;
// Triplicate for infinite scroll illusion: [copy][original][copy]
const ITEMS = [...NFT_EDITIONS, ...NFT_EDITIONS, ...NFT_EDITIONS];

interface EditionCarouselProps {
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export const EditionCarousel: FC<EditionCarouselProps> = ({
  selectedId,
  onSelect,
}) => {
  // offset tracks how many items we've shifted from the "original" center (index 0)
  const [offset, setOffset] = useState(0);
  const touchStartX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const wrap = (i: number) => ((i % TOTAL) + TOTAL) % TOTAL;
  const centerIdx = wrap(offset);
  const centerEdition = NFT_EDITIONS[centerIdx];

  const go = useCallback((dir: number) => {
    setOffset((prev) => prev + dir);
  }, []);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go]);

  // Touch/swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 40) go(diff < 0 ? 1 : -1);
  };

  // Each card width as percentage of container, with gap accounted
  // We show 5 on desktop. The translateX shifts by one card width per offset.
  // Card width = 20% of container. We shift by 20% per step.
  // The middle of the triplicated array (index TOTAL) should be the starting center.
  // translateX = -(startingCenter + offset) * cardWidth + containerCenter
  // In percentage: shift = -(TOTAL + offset) * 20% + 40% (to center the 3rd of 5)
  const shiftPercent = -(TOTAL + offset) * 20 + 40;

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Carousel row */}
      <div className="relative flex items-center gap-2">
        {/* Left arrow */}
        <button
          onClick={() => go(-1)}
          className="hidden sm:flex flex-shrink-0 w-10 h-10 items-center justify-center rounded-full bg-white/[0.06] border border-white/10 text-nasun-white/60 hover:text-nasun-white hover:bg-white/10 transition-colors z-10"
          aria-label="Previous"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        {/* Track */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <motion.div
            className="flex"
            animate={{ x: `${shiftPercent}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            style={{ gap: "0.75rem" }}
          >
            {ITEMS.map((edition, i) => {
              const distFromCenter = Math.abs(i - (TOTAL + offset));
              const isCenter = distFromCenter === 0;
              return (
                <div
                  key={i}
                  className="flex-shrink-0 transition-all duration-300"
                  style={{
                    width: "calc(20% - 0.6rem)",
                    opacity: isCenter ? 1 : distFromCenter === 1 ? 0.7 : 0.4,
                    transform: `scale(${isCenter ? 1 : distFromCenter === 1 ? 0.95 : 0.88})`,
                  }}
                >
                  <NftDropVideoCard
                    id={edition.id}
                    name={edition.name}
                    description={edition.description}
                    compact
                    selected={selectedId === edition.id}
                    onSelect={(id) => {
                      onSelect(id);
                      setOffset(i - TOTAL);
                    }}
                  />
                </div>
              );
            })}
          </motion.div>

          {/* Left fade gradient */}
          <div
            className="absolute inset-y-0 left-0 w-16 sm:w-24 z-10 pointer-events-none"
            style={{
              background: "linear-gradient(to right, rgb(25,22,21) 0%, rgba(25,22,21,0.6) 50%, transparent 100%)",
            }}
          />
          {/* Right fade gradient */}
          <div
            className="absolute inset-y-0 right-0 w-16 sm:w-24 z-10 pointer-events-none"
            style={{
              background: "linear-gradient(to left, rgb(25,22,21) 0%, rgba(25,22,21,0.6) 50%, transparent 100%)",
            }}
          />
        </div>

        {/* Right arrow */}
        <button
          onClick={() => go(1)}
          className="hidden sm:flex flex-shrink-0 w-10 h-10 items-center justify-center rounded-full bg-white/[0.06] border border-white/10 text-nasun-white/60 hover:text-nasun-white hover:bg-white/10 transition-colors z-10"
          aria-label="Next"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-2">
        {NFT_EDITIONS.map((edition, i) => (
          <button
            key={edition.id}
            onClick={() => setOffset(i)}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === centerIdx
                ? "bg-amber-400 w-6"
                : "w-2 bg-white/20 hover:bg-white/40"
            }`}
            aria-label={`Go to ${edition.name}`}
          />
        ))}
      </div>

      {/* Featured center edition - large preview */}
      <div className="max-w-xl mx-auto">
        <div className="relative rounded-2xl overflow-hidden border-2 border-amber-400/30 shadow-[0_0_60px_rgba(249,168,36,0.1)]">
          <div className="aspect-square relative overflow-hidden bg-gray-900">
            <img
              src="/videos/genesis-pass-poster.webp"
              alt={centerEdition.name}
              className="absolute inset-0 w-full h-full object-cover transition-[filter] duration-500"
              style={{
                filter: `hue-rotate(${centerEdition.id * 15}deg) saturate(${0.8 + centerEdition.id * 0.1})`,
              }}
            />
            <div className="absolute top-4 left-4 z-10">
              <span
                className="text-sm font-mono tracking-wider uppercase px-3 py-1.5 rounded-lg"
                style={{
                  background: "rgba(0,0,0,0.5)",
                  color: "rgba(255,255,255,0.8)",
                  backdropFilter: "blur(8px)",
                }}
              >
                #{centerEdition.id}
              </span>
            </div>
            {selectedId === centerEdition.id && (
              <div className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center shadow-lg">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12l5 5L20 7" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
            <div
              className="absolute bottom-0 left-0 right-0 h-32"
              style={{
                background: "linear-gradient(to top, rgba(25,22,21,0.95) 0%, rgba(25,22,21,0.6) 50%, transparent 100%)",
              }}
            />
          </div>
          <div className="p-5 -mt-4 relative">
            <h3 className="text-xl font-semibold text-nasun-white">
              {centerEdition.name}
            </h3>
            <p className="text-sm text-nasun-white/70 mt-1">
              {centerEdition.description}
            </p>
          </div>
        </div>
        <button
          onClick={() => onSelect(centerEdition.id)}
          className={`mt-4 w-full py-3 rounded-xl text-sm font-semibold transition-all ${
            selectedId === centerEdition.id
              ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
              : "bg-white/[0.06] text-nasun-white/80 border border-white/10 hover:bg-white/10 hover:text-nasun-white"
          }`}
        >
          {selectedId === centerEdition.id
            ? `${centerEdition.name} Selected`
            : `Select ${centerEdition.name}`}
        </button>
      </div>
    </div>
  );
};
