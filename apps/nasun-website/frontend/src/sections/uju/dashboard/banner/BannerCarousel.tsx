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
  onClick,
}: {
  vote: 'up' | 'down';
  active: boolean;
  onClick: () => void;
}) {
  const activeClass = vote === 'up' ? 'text-pado-3' : 'text-nasun-scarlet';
  return (
    <button
      onClick={onClick}
      aria-label={vote === 'up' ? 'Helpful' : 'Not helpful'}
      className={`transition-colors ${active ? activeClass : 'text-uju-secondary hover:text-uju-primary'}`}
    >
      {vote === 'up' ? <ThumbUpIcon /> : <ThumbDownIcon />}
    </button>
  );
}

export function BannerCarousel() {
  const [{ index, direction }, dispatch] = useReducer(reducer, { index: 0, direction: 1 as const });
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>(loadFeedback);
  const pausedRef = useRef(false);
  const touchStartX = useRef(0);

  const banner = BANNER_ITEMS[index];
  const accent = ACCENT_STYLES[banner.accent];

  // Auto-advance: single interval, never recreated
  useEffect(() => {
    if (BANNER_ITEMS.length <= 1) return;
    const id = setInterval(() => {
      if (!pausedRef.current) dispatch({ type: 'GO', dir: 1 });
    }, 5000);
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
      className="relative bg-uju-card border border-uju-border rounded-xl overflow-hidden min-h-[176px]"
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
          className="absolute inset-0 p-5 flex flex-col justify-between"
        >
          {/* Top: tag + nav arrows */}
          <div className="flex items-center justify-between">
            <span className={`text-base font-medium px-2.5 py-0.5 rounded-full ${accent.tag}`}>
              {banner.tag}
            </span>
            <div className="flex items-center gap-2 text-uju-secondary">
              <button
                onClick={() => dispatch({ type: 'GO', dir: -1 })}
                aria-label="Previous banner"
                className="hover:text-uju-primary transition-colors"
              >
                <ChevronLeftIcon />
              </button>
              <span className="text-base tabular-nums">{index + 1}/{BANNER_ITEMS.length}</span>
              <button
                onClick={() => dispatch({ type: 'GO', dir: 1 })}
                aria-label="Next banner"
                className="hover:text-uju-primary transition-colors"
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>

          {/* Middle: title + description */}
          <div>
            <p className="text-lg font-semibold text-uju-primary">{banner.title}</p>
            <p className="text-base text-uju-secondary mt-1 line-clamp-2">{banner.description}</p>
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
                  className={`text-base px-3 py-1 rounded-lg border transition-colors ${accent.cta}`}
                >
                  {banner.ctaLabel}
                </a>
              ) : (
                <Link
                  to={banner.ctaUrl}
                  className={`text-base px-3 py-1 rounded-lg border transition-colors ${accent.cta}`}
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
                onClick={() => handleFeedback(banner.id, 'up')}
              />
              <FeedbackButton
                vote="down"
                active={feedback[banner.id] === 'down'}
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
