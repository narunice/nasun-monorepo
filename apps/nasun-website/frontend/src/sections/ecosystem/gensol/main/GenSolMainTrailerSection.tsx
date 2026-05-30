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
  const [autoplay, setAutoplay] = useState(false);

  // Decide once at mount whether autoplay is allowed (desktop + no reduced
  // motion). The decision feeds the JSX so the native `autoPlay` attribute
  // is set when conditions are met — far more reliable than calling
  // `video.play()` programmatically after preload="none".
  useEffect(() => {
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setAutoplay(isDesktop && !reduced);
  }, []);

  // Lazy-mount the <video> element only after the section enters the
  // viewport. Keeps the trailer's media fetch off the LCP budget on /main.
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

  // Once mounted with autoplay, mark playing so we can show <controls> and
  // hide the overlay. The browser kicks off playback via the autoPlay
  // attribute; we just track the state.
  useEffect(() => {
    if (!mounted || !autoplay || playing || errored) return;
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPlaying = () => setPlaying(true);
    v.addEventListener("play", onPlay);
    v.addEventListener("playing", onPlaying);
    // Some browsers gate muted autoplay behind a programmatic poke even with
    // the attribute set — fire one play() as belt-and-braces, ignore reject.
    v.play().catch(() => {
      /* user can still tap the overlay */
    });
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("playing", onPlaying);
    };
  }, [mounted, autoplay, playing, errored]);

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
  // When autoplay is desired we let the browser preload metadata so playback
  // can start immediately. Otherwise we keep preload at "none" to spare
  // mobile cellular and let the user opt in via the Play button.
  const preload = autoplay ? "metadata" : "none";

  return (
    <ChSection fullMinHeight={false}>
      <FadeInUp className="flex flex-col gap-3 items-start text-left">
        <span className="ch-eyebrow">01 / Teaser</span>
        <h2 className="ch-display">
          The first cast, <span className="gs-accent">built to be owned</span>
        </h2>
      </FadeInUp>

      <FadeInUp>
        <div
          id="trailer"
          ref={wrapRef}
          className="gs-trailer-frame"
          style={{ scrollMarginTop: 80 }}
        >
          {/* Poster as a static <img> until the <video> takes over.
              Protects LCP and gives the Play button a backdrop. */}
          {!playing && (
            <img
              src={TRAILER_POSTER}
              alt="Gen Sol teaser poster"
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
              src={src}
              poster={TRAILER_POSTER}
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
              aria-label="Play teaser"
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
              Teaser unavailable — try refreshing
            </div>
          )}
        </div>
      </FadeInUp>
    </ChSection>
  );
}
