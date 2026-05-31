import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  mobileSrc?: string;
  poster: string;
  ariaLabel: string;
  caption?: string;
};

/**
 * 16:9 video frame with the same lazy-mount + Play-button + reduced-motion
 * + onError fallback policy as the Color Trailer (plan §3.1 + §6 rules 7-9).
 * Shared between the Shooter Hero gameplay video and Progress video so the
 * shooter page stays at 5 section files instead of 7.
 */
export default function LazyVideoFrame({
  src,
  mobileSrc,
  poster,
  ariaLabel,
  caption,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mounted, setMounted] = useState(false);
  const [inView, setInView] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [errored, setErrored] = useState(false);
  const [autoplay, setAutoplay] = useState(false);

  useEffect(() => {
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setAutoplay(isDesktop && !reduced);
  }, []);

  // Track real viewport visibility. Mount on first true entry (and keep it
  // mounted so the loaded video survives scroll-away), and surface `inView`
  // so playback never begins before the frame is actually on screen.
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? false;
        setInView(visible);
        if (visible) setMounted(true);
      },
      { threshold: 0.25 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!mounted || !autoplay || errored) return;
    const v = videoRef.current;
    if (!v) return;
    if (!inView) {
      v.pause();
      return;
    }
    const onPlay = () => setPlaying(true);
    const onPlaying = () => setPlaying(true);
    v.addEventListener("play", onPlay);
    v.addEventListener("playing", onPlaying);
    v.play().catch(() => {
      /* user can still tap the overlay */
    });
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("playing", onPlaying);
    };
  }, [mounted, autoplay, inView, errored]);

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
  const finalSrc = isMobile && mobileSrc ? mobileSrc : src;
  const preload = autoplay ? "metadata" : "none";

  return (
    <figure style={{ margin: 0 }}>
      <div ref={wrapRef} className="gs-trailer-frame">
        {!playing && (
          <img
            src={poster}
            alt=""
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
        )}

        {mounted && !errored && (
          <video
            ref={videoRef}
            src={finalSrc}
            poster={poster}
            playsInline
            muted
            loop
            preload={preload}
            autoPlay={autoplay}
            controls={playing}
            onError={() => setErrored(true)}
          />
        )}

        {!playing && !errored && (
          <button
            type="button"
            className="gs-trailer-overlay"
            aria-label={ariaLabel}
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
            Video unavailable — try refreshing
          </div>
        )}
      </div>
      {caption && (
        <figcaption
          style={{
            marginTop: "0.85rem",
            textAlign: "center",
            fontFamily: "var(--ch-font-mono)",
            fontSize: "0.6875rem",
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "var(--ch-fg-subdued)",
          }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
