import { useReducer, useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Link } from 'react-router-dom';
import { BANNER_ITEMS, ACCENT_STYLES } from './bannerData';

// --- State ---

type State = { index: number; direction: 1 | -1 };
type Action = { type: 'GO'; dir: 1 | -1 } | { type: 'JUMP'; to: number };

function reducer(state: State, action: Action): State {
  const n = BANNER_ITEMS.length;
  if (action.type === 'GO') {
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
}

// --- Animation ---

const variants: Variants = {
  enter: (dir: number) => ({ x: dir > 0 ? '60%' : '-60%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-60%' : '60%', opacity: 0 }),
};

// --- Feedback ---

const FEEDBACK_KEY = 'uju:banner-feedback';
const VALID_IDS = new Set(BANNER_ITEMS.map((b) => b.id));

function loadFeedback(): Record<string, 'up' | 'down'> {
  try {
    const raw = JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? '{}');
    return Object.fromEntries(
      Object.entries(raw).filter(
        ([k, v]) => VALID_IDS.has(k) && (v === 'up' || v === 'down'),
      ),
    ) as Record<string, 'up' | 'down'>;
  } catch {
    return {};
  }
}

// --- Icons ---

function ThumbUpIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
      <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// --- Component ---

function FeedbackButton({
  vote,
  active,
  light,
  onClick,
}: {
  vote: 'up' | 'down';
  active: boolean;
  light?: boolean;
  onClick: () => void;
}) {
  const activeClass = vote === 'up' ? 'text-pado-2' : 'text-nasun-scarlet';
  const inactiveClass = light ? 'text-black/40 hover:text-black' : 'text-uju-secondary hover:text-uju-primary';
  return (
    <button
      onClick={onClick}
      aria-label={vote === 'up' ? 'Helpful' : 'Not helpful'}
      className={`transition-colors ${active ? activeClass : inactiveClass}`}
    >
      {vote === 'up' ? <ThumbUpIcon /> : <ThumbDownIcon />}
    </button>
  );
}

function XLogoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function BannerCarousel() {
  const [{ index, direction }, dispatch] = useReducer(reducer, { index: 0, direction: 1 as const });
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>(loadFeedback);
  const pausedRef = useRef(false);
  const touchStartX = useRef(0);

  const banner = BANNER_ITEMS[index];
  const accentBase = ACCENT_STYLES[banner.accent];
  const activeBg = banner.bg ?? accentBase.bg;
  const isLight = banner.light ?? accentBase.light ?? false;
  const accent = { ...accentBase, bg: activeBg, light: isLight };

  // Auto-advance: single interval, never recreated
  useEffect(() => {
    if (BANNER_ITEMS.length <= 1) return;
    const id = setInterval(() => {
      if (!pausedRef.current) dispatch({ type: 'GO', dir: 1 });
    }, 10000);
    return () => clearInterval(id);
  }, []);

  // Keyboard navigation (guarded: skip when input/textarea is focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      if (active instanceof HTMLElement && active.closest('[role="dialog"]')) return;
      if (e.key === 'ArrowLeft')  dispatch({ type: 'GO', dir: -1 });
      if (e.key === 'ArrowRight') dispatch({ type: 'GO', dir: 1 });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Persist feedback to localStorage separately from state update
  useEffect(() => {
    try {
      localStorage.setItem(FEEDBACK_KEY, JSON.stringify(feedback));
    } catch {
      // Safari private mode or storage quota exceeded
    }
  }, [feedback]);

  function handleFeedback(id: string, vote: 'up' | 'down') {
    setFeedback((prev) => {
      const next = { ...prev };
      if (next[id] === vote) delete next[id];
      else next[id] = vote;
      return next;
    });
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 40) dispatch({ type: 'GO', dir: diff < 0 ? 1 : -1 });
  }

  return (
    <div
      role="region"
      aria-label="Announcements"
      className={`relative border rounded-lg overflow-hidden min-h-[176px] transition-colors duration-500 ${accent.bg ? `${accent.bg} border-black/10` : 'bg-gray-950/50 backdrop-blur-sm border-uju-border/60'}`}
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${accent.bar}`} />

      {/* Slide content */}
      <AnimatePresence mode="popLayout" custom={direction}>
        <motion.div
          key={index}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="absolute inset-0 p-5 flex flex-col justify-between overflow-hidden"
        >
          {/* Decorative X logo for amber (light) banners */}
          {banner.id === 'repost-bonus' && (
            <div className="hidden sm:block absolute right-24 top-1/2 -translate-y-1/2 w-24 h-24 text-black/8 pointer-events-none select-none">
              <XLogoIcon />
            </div>
          )}
          {/* Top: tag + nav arrows */}
          <div className="flex items-center justify-between">
            <span className={`text-base font-light px-2.5 py-0.5 rounded-full ${isLight ? 'text-black/80 bg-black/20 font-medium' : accent.tag}`}>
              {banner.tag}
            </span>
            <div className={`flex items-center gap-2 ${accent.light ? 'text-black/50' : 'text-uju-secondary'}`}>
              <button
                onClick={() => dispatch({ type: 'GO', dir: -1 })}
                aria-label="Previous banner"
                className={`transition-colors ${accent.light ? 'hover:text-black' : 'hover:text-uju-primary'}`}
              >
                <ChevronLeftIcon />
              </button>
              <span className="text-base tabular-nums">{index + 1}/{BANNER_ITEMS.length}</span>
              <button
                onClick={() => dispatch({ type: 'GO', dir: 1 })}
                aria-label="Next banner"
                className={`transition-colors ${accent.light ? 'hover:text-black' : 'hover:text-uju-primary'}`}
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>

          {/* Middle: title + description */}
          <div>
            <p className={`text-xl font-semibold ${accent.light ? 'text-black' : 'text-uju-primary'}`}>{banner.title}</p>
            <p className={`text-base mt-1.5 line-clamp-2 ${accent.light ? 'text-black/70' : 'text-uju-secondary'}`}>{banner.description}</p>
          </div>

          {/* Bottom: CTA + feedback */}
          <div className="flex items-center justify-between">
            {banner.ctaLabel && banner.ctaUrl ? (
              banner.isExternal ? (
                <a
                  href={banner.ctaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${banner.ctaLabel}, opens in new tab`}
                  className={`text-base px-3 py-1 rounded-lg border transition-colors ${isLight ? 'text-black border-black/30 hover:bg-black/10 font-medium' : accent.cta}`}
                >
                  {banner.ctaLabel}
                </a>
              ) : (
                <Link
                  to={banner.ctaUrl}
                  className={`text-base px-3 py-1 rounded-lg border transition-colors ${isLight ? 'text-black border-black/30 hover:bg-black/10 font-medium' : accent.cta}`}
                >
                  {banner.ctaLabel}
                </Link>
              )
            ) : (
              <div />
            )}
            <div className="flex items-center gap-3">
              <FeedbackButton
                vote="up"
                active={feedback[banner.id] === 'up'}
                light={accent.light}
                onClick={() => handleFeedback(banner.id, 'up')}
              />
              <FeedbackButton
                vote="down"
                active={feedback[banner.id] === 'down'}
                light={accent.light}
                onClick={() => handleFeedback(banner.id, 'down')}
              />
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Dot indicators */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
        {BANNER_ITEMS.map((_, i) => (
          <button
            key={i}
            onClick={() => dispatch({ type: 'JUMP', to: i })}
            aria-label={`Go to banner ${i + 1}`}
            aria-current={i === index ? true : undefined}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === index ? `w-5 ${accent.bar}` : 'w-1.5 bg-uju-border'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
