import { type ReactNode, useEffect, useReducer, useRef, useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";

const AUTO_ADVANCE_MS = 5000;

export interface CarouselSlide {
  id: string;
  node: ReactNode;
}

interface Props {
  slides: CarouselSlide[];
}

type State = { index: number; direction: 1 | -1 };
type Action = { type: "GO"; dir: 1 | -1 } | { type: "JUMP"; to: number };

function makeReducer(n: number) {
  return (state: State, action: Action): State => {
    if (action.type === "GO") {
      return {
        direction: action.dir,
        index: ((state.index + action.dir) % n + n) % n,
      };
    }
    if (action.to === state.index) return state;
    return {
      direction: action.to > state.index ? 1 : -1,
      index: action.to,
    };
  };
}

const slideVariants: Variants = {
  enter: (dir: number) => ({ x: dir > 0 ? "60%" : "-60%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? "-60%" : "60%", opacity: 0 }),
};

export function NewsCarousel({ slides }: Props) {
  const n = slides.length;
  const [{ index, direction }, dispatch] = useReducer(
    makeReducer(Math.max(1, n)),
    { index: 0, direction: 1 as const },
  );
  const pausedRef = useRef(false);
  const touchStartX = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Bumping this resets the auto-advance interval whenever the user manually
  // moves the carousel, so a manual nudge buys them a fresh 5 seconds.
  const [intervalKey, setIntervalKey] = useState(0);

  // Auto-advance. Recreated when intervalKey changes (manual interaction).
  // prefers-reduced-motion users get no auto-advance.
  useEffect(() => {
    if (n <= 1) return;
    if (typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mq.matches) return;
    }
    const id = setInterval(() => {
      if (!pausedRef.current) dispatch({ type: "GO", dir: 1 });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(id);
  }, [n, intervalKey]);

  // Keyboard navigation scoped to the container node to avoid conflict with
  // other carousels on the same page (e.g. BannerCarousel above).
  useEffect(() => {
    if (n <= 1) return;
    const node = containerRef.current;
    if (!node) return;
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "ArrowLeft") {
        dispatch({ type: "GO", dir: -1 });
        setIntervalKey((k) => k + 1);
      } else if (e.key === "ArrowRight") {
        dispatch({ type: "GO", dir: 1 });
        setIntervalKey((k) => k + 1);
      }
    };
    node.addEventListener("keydown", handler);
    return () => node.removeEventListener("keydown", handler);
  }, [n]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 40) {
      dispatch({ type: "GO", dir: diff < 0 ? 1 : -1 });
      setIntervalKey((k) => k + 1);
    }
  }

  if (n === 0) return null;
  const current = slides[index];

  return (
    <div
      ref={containerRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Updates"
      tabIndex={0}
      className="relative w-full min-h-[244px] sm:min-h-[260px] rounded-md overflow-hidden focus:outline-none"
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence mode="popLayout" custom={direction}>
        <motion.div
          key={current.id}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          {current.node}
        </motion.div>
      </AnimatePresence>

      {n > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-3 z-10">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => {
                dispatch({ type: "JUMP", to: i });
                setIntervalKey((k) => k + 1);
              }}
              aria-label={`Go to update ${i + 1}`}
              aria-current={i === index ? true : undefined}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === index
                  ? "w-8 bg-pado-3"
                  : "w-2 bg-uju-border hover:bg-uju-border/80"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
