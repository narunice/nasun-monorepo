import { useEffect, useRef, useState } from "react";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";

const TRAILER_DESKTOP = "/videos/Color-Trailer-No-Symbol-16x9-web.mp4";
const TRAILER_MOBILE = "/videos/Full-Trailer184s-mobile-rf28.mp4";
const TRAILER_POSTER = "/images/posters/Full-Trailer184s-rf28.webp";

export default function GenSolMainTrailerSection() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mounted, setMounted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [errored, setErrored] = useState(false);

  // Lazy-mount the <video> element only after the section enters the viewport.
  // Keeps the trailer's metadata fetch off the LCP budget on /main.
  useEffect(() => {
    const node = wrapRef.current;
    if (!node || mounted) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px 200px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [mounted]);

  // Optional autoplay: only when desktop AND no reduced-motion preference.
  // Defaults to opt-in play button everywhere else.
  useEffect(() => {
    if (!mounted || playing || errored) return;
    const v = videoRef.current;
    if (!v) return;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (isDesktop && !reduced) {
      // Best-effort: if iOS LPM blocks, the catch keeps the overlay visible.
      v.play()
        .then(() => setPlaying(true))
        .catch(() => {
          /* fall through to manual play button */
        });
    }
  }, [mounted, playing, errored]);

  const handlePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    v.play()
      .then(() => {
        setPlaying(true);
        v.focus();
      })
      .catch(() => setErrored(true));
  };

  const isMobile =
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 1023px)").matches
      : false;
  const src = isMobile ? TRAILER_MOBILE : TRAILER_DESKTOP;

  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-3 items-start text-left">
        <span className="ch-eyebrow">01 / Trailer</span>
        <h2 className="ch-display">
          A first look at the <span className="gs-accent">Gen Sol Galaxy</span>
        </h2>
      </FadeInUp>

      <FadeInUp>
        <div
          id="trailer"
          ref={wrapRef}
          className="gs-trailer-frame"
          style={{ scrollMarginTop: 80 }}
        >
          {/* Poster always present — protects LCP and gives the Play button
              a clean backdrop until the user opts in. */}
          <img
            src={TRAILER_POSTER}
            alt="Gen Sol trailer poster"
            loading="lazy"
            decoding="async"
            // @ts-expect-error fetchpriority is a valid HTML attribute
            fetchpriority="low"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />

          {mounted && !errored && (
            <video
              ref={videoRef}
              src={src}
              poster={TRAILER_POSTER}
              playsInline
              muted
              loop
              preload="none"
              controls={playing}
              onError={() => setErrored(true)}
              onSuspend={() => {
                /* iOS LPM may suspend silently — keep overlay visible */
              }}
            />
          )}

          {!playing && !errored && (
            <button
              type="button"
              className="gs-trailer-overlay"
              aria-label="Play trailer"
              onClick={handlePlay}
            >
              <span className="gs-trailer-overlay-glyph" aria-hidden="true">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </button>
          )}

          {errored && (
            <div
              role="alert"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#e8eaec",
                fontFamily: "var(--ch-font-mono)",
                fontSize: "0.75rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}
            >
              Trailer unavailable — try refreshing
            </div>
          )}
        </div>
      </FadeInUp>
    </ChSection>
  );
}
