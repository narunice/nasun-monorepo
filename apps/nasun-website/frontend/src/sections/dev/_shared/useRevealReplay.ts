import { type RefObject, useEffect } from "react";

/**
 * Trigger a one-shot viz replay on each card the first time it enters the
 * viewport. Cards are matched by selector inside `gridRef`. On entry, the
 * hook sets `data-state="playing"` on the card for `playMs` milliseconds,
 * then flips it to `"done"`. CSS gated on `:hover, [data-state="playing"]`
 * picks up the auto-replay without any further coupling.
 *
 * Cards in the same viewport-revealed batch are staggered by **column** so
 * a desktop row reads left → right instead of firing simultaneously. The
 * column count is read live from `grid-template-columns`, so it adapts to
 * 1-col (mobile), 2-col (tablet), and 4-col (desktop) layouts without any
 * media query duplication. In 1-col stacks the stagger is zero — natural
 * scroll cadence already separates entries.
 *
 * Respects `prefers-reduced-motion`. No-op on SSR.
 */
export function useRevealReplay<T extends HTMLElement>(
  gridRef: RefObject<T | null>,
  options: {
    cardSelector?: string;
    playMs?: number;
    staggerMs?: number;
    threshold?: number;
    rootMargin?: string;
  } = {},
) {
  const {
    cardSelector = "[data-spotlight-card]",
    playMs = 2800,
    staggerMs = 660,
    threshold = 0.4,
    rootMargin = "0px 0px -10% 0px",
  } = options;

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    if (typeof window === "undefined") return;
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cards = Array.from(
      grid.querySelectorAll<HTMLElement>(cardSelector),
    );
    if (cards.length === 0) return;

    const getCols = () => {
      const tmpl = window.getComputedStyle(grid).gridTemplateColumns;
      const tokens = tmpl.split(" ").filter(Boolean);
      return Math.max(1, tokens.length);
    };

    const startTimers = new WeakMap<HTMLElement, number>();
    const endTimers = new WeakMap<HTMLElement, number>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const card = entry.target as HTMLElement;
          const index = cards.indexOf(card);
          if (index < 0) continue;
          const cols = getCols();
          const stagger = (index % cols) * staggerMs;

          const startId = window.setTimeout(() => {
            card.dataset.state = "playing";
            const endId = window.setTimeout(() => {
              // Always settle to "done". CSS :hover handles re-triggering:
              // the selector goes false when not hovering, then true again
              // on next hover, which restarts the one-shot animation cleanly.
              // Keeping "playing" here was the bug — it caused the selector
              // to stay permanently true, preventing any subsequent replay.
              card.dataset.state = "done";
            }, playMs);
            endTimers.set(card, endId);
          }, stagger);
          startTimers.set(card, startId);

          io.unobserve(card);
        }
      },
      { threshold, rootMargin },
    );

    cards.forEach((c) => io.observe(c));
    return () => {
      io.disconnect();
      cards.forEach((c) => {
        const s = startTimers.get(c);
        const e = endTimers.get(c);
        if (s) window.clearTimeout(s);
        if (e) window.clearTimeout(e);
      });
    };
  }, [gridRef, cardSelector, playMs, staggerMs, threshold, rootMargin]);
}
