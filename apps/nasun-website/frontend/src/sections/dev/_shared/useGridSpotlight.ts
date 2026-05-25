import { useEffect, useRef } from "react";

/**
 * Attach a cursor-follow spotlight that bleeds across a grid of cards.
 *
 * On every pointermove, the hook writes `--mx` / `--my` (px) on each card
 * **translated into that card's local coordinate space** so a CSS
 * `radial-gradient(... at var(--mx) var(--my), ...)` background lines up
 * with the actual pointer regardless of which card it is hovering. The
 * grid-level `--in` flag is set on enter/leave so cards can fade their
 * spotlight layer in and out.
 *
 * Throttled via requestAnimationFrame. No-ops on coarse-pointer (touch)
 * devices.
 *
 * @param cardSelector  CSS selector for the card elements inside the grid.
 *                      Defaults to `[data-spotlight-card]`.
 */
export function useGridSpotlight<T extends HTMLElement>(
  cardSelector = "[data-spotlight-card]",
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    let frame = 0;
    let nextX = 0;
    let nextY = 0;

    const flush = () => {
      frame = 0;
      const cards = el.querySelectorAll<HTMLElement>(cardSelector);
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${nextX - rect.left}px`);
        card.style.setProperty("--my", `${nextY - rect.top}px`);
      });
    };

    const onMove = (e: PointerEvent) => {
      nextX = e.clientX;
      nextY = e.clientY;
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const onEnter = () => {
      el.style.setProperty("--in", "1");
    };
    const onLeave = () => {
      el.style.setProperty("--in", "0");
    };

    el.style.setProperty("--in", "0");
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [cardSelector]);

  return ref;
}
