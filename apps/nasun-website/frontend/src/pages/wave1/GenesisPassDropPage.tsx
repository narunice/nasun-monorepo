import { useState, useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { InlineLoading } from "@/components/ui/InlineLoading";
import {
  CountdownTimer,
  type TimeLeft,
} from "@/sections/wave1/genesis-pass-drop/CountdownTimer";
import { SectionTitle } from "@/components/ui";

// ---------------------------------------------------------------------------
// Mint phase schedule (all times in UTC)
// ---------------------------------------------------------------------------

interface MintPhase {
  label: string;
  target: Date;
  price?: string;
  targetTimeUTC: string;
}

const MINT_PHASES: MintPhase[] = [
  {
    label: "Free Mint",
    target: new Date("2026-04-07T15:00:00Z"),
    price: "0 ETH",
    targetTimeUTC: "Apr 7, 3:00 PM UTC",
  },
  {
    label: "GTD Allowlist",
    target: new Date("2026-04-08T03:00:00Z"),
    price: "~$8 in ETH",
    targetTimeUTC: "Apr 8, 3:00 AM UTC",
  },
  {
    label: "FCFS Allowlist",
    target: new Date("2026-04-08T15:00:00Z"),
    price: "~$10 in ETH",
    targetTimeUTC: "Apr 8, 3:00 PM UTC",
  },
  {
    label: "Public Mint",
    target: new Date("2026-04-09T15:00:00Z"),
    price: "~$15 in ETH",
    targetTimeUTC: "Apr 9, 3:00 PM UTC",
  },
];

const MINT_CLOSE_PHASE: MintPhase = {
  label: "Mint closes",
  target: new Date("2026-04-14T15:00:00Z"),
  targetTimeUTC: "Apr 14, 3:00 PM UTC",
};

const PUBLIC_MINT_START = MINT_PHASES[3].target;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcTimeLeft(
  target: Date,
  now: number,
): TimeLeft & { isExpired: boolean } {
  const diff = target.getTime() - now;
  if (diff <= 0)
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
  const seconds = Math.floor((diff / 1000) % 60);
  const minutes = Math.floor((diff / 1000 / 60) % 60);
  const hours = Math.floor((diff / 1000 / 60 / 60) % 24);
  const days = Math.floor(diff / 1000 / 60 / 60 / 24);
  return { days, hours, minutes, seconds, isExpired: false };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function GenesisPassDropPage() {
  // Video loading state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [skipVideo, setSkipVideo] = useState(false);

  // Countdown state: array of TimeLeft for each active phase
  const [countdowns, setCountdowns] = useState<
    (TimeLeft & { isExpired: boolean })[]
  >(() => {
    const now = Date.now();
    const phases =
      now >= PUBLIC_MINT_START.getTime()
        ? [...MINT_PHASES, MINT_CLOSE_PHASE]
        : MINT_PHASES;
    return phases.map((p) => calcTimeLeft(p.target, now));
  });
  const [showMintClose, setShowMintClose] = useState(
    () => Date.now() >= PUBLIC_MINT_START.getTime(),
  );

  // Skip video on slow connections
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (navigator as any).connection;
    if (
      conn &&
      (conn.saveData ||
        conn.effectiveType === "2g" ||
        conn.effectiveType === "slow-2g")
    ) {
      setSkipVideo(true);
    }
  }, []);

  // Video handlers
  const handleVideoPlaying = () => setIsVideoPlaying(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || skipVideo) return;
    if (video.readyState >= 3) setIsVideoPlaying(true);
    video
      .play()
      .then(() => setIsVideoPlaying(true))
      .catch(() => {});
  }, [skipVideo]);

  // 5-second timeout fallback
  useEffect(() => {
    if (skipVideo) return;
    const timeout = setTimeout(() => {
      if (!isVideoPlaying) setIsVideoPlaying(true);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [isVideoPlaying, skipVideo]);

  // Single interval for all countdowns
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const shouldShowClose = now >= PUBLIC_MINT_START.getTime();
      setShowMintClose(shouldShowClose);
      const phases = shouldShowClose
        ? [...MINT_PHASES, MINT_CLOSE_PHASE]
        : MINT_PHASES;
      setCountdowns(phases.map((p) => calcTimeLeft(p.target, now)));
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const activePhases = showMintClose
    ? [...MINT_PHASES, MINT_CLOSE_PHASE]
    : MINT_PHASES;

  return (
    <>
      <Helmet>
        <title>Genesis Pass Drop - NASUN</title>
        <meta
          name="description"
          content="Nasun Genesis Pass mint schedule. Free mint, allowlist, and public mint phases."
        />
      </Helmet>

      <div
        className="min-h-screen w-full"
        style={{
          background:
            "linear-gradient(180deg, #0f0d0b 0%, #141210 50%, #0f0d0b 100%)",
        }}
      >
        {/* Hero section */}
        <div className="relative w-full h-screen overflow-hidden flex items-center justify-center">
          {/* Video background or poster fallback */}
          {skipVideo ? (
            <img
              src="/images/posters/Canyons-X-Post-web.webp"
              alt=""
              className="absolute inset-0 w-full h-full object-cover max-w-[1920px] mx-auto"
            />
          ) : (
            <>
              {!isVideoPlaying && (
                <div className="absolute inset-0 bg-nasun-black flex items-center justify-center z-20">
                  <InlineLoading message="Loading..." size="lg" />
                </div>
              )}
              <video
                ref={videoRef}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                poster="/images/posters/Canyons-X-Post-web.webp"
                onPlaying={handleVideoPlaying}
                className={`absolute inset-0 w-full h-full object-cover max-w-[1920px] left-1/2 -translate-x-1/2 transition-opacity duration-500 ${
                  isVideoPlaying ? "opacity-100" : "opacity-0"
                }`}
              >
                <source src="/videos/Canyons-X-Post-web.mp4" type="video/mp4" />
              </video>
            </>
          )}

          {/* Gradient overlay */}
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background:
                "linear-gradient(to bottom, rgba(15,13,11,0.3) 0%, transparent 30%, transparent 50%, rgba(15,13,11,0.8) 80%, rgb(15,13,11) 100%)",
            }}
          />

          {/* Mobile: flex column layout (title + timers flow together) */}
          <div className="md:hidden relative z-20 flex flex-col items-center justify-between h-full px-4 pb-8 pt-[50vh]">
            <div className="flex items-center">
              <FadeInUp>
                <SectionTitle as="h1" className="pt-6 text-center">
                  <span className="!font-changeling font-bold">GENESIS</span>{" "}
                  <span className="!font-changeling font-medium">PASS</span>
                </SectionTitle>
                <p className="text-xl text-nasun-white/90 text-center tracking-[0.2em] uppercase mt-2">
                  COMING SOON
                </p>
              </FadeInUp>
            </div>

            <div className="w-full max-w-3xl grid grid-cols-1 gap-2 mt-6">
              {activePhases.map((phase, i) => (
                <FadeInUp key={phase.label} delay={`${0.2 + i * 0.1}s`}>
                  <CountdownTimer
                    label={phase.label}
                    price={phase.price}
                    targetTimeUTC={phase.targetTimeUTC}
                    timeLeft={
                      countdowns[i] ?? {
                        days: 0,
                        hours: 0,
                        minutes: 0,
                        seconds: 0,
                      }
                    }
                    isExpired={countdowns[i]?.isExpired ?? false}
                  />
                </FadeInUp>
              ))}
            </div>
          </div>

          {/* Desktop: title centered, timers absolute bottom */}
          <div className="hidden md:flex relative z-20 flex-col items-center px-4 mt-[10vh]">
            <FadeInUp>
              <SectionTitle as="h1" className="">
                <span className="!font-changeling font-bold">GENESIS</span>{" "}
                <span className="!font-changeling font-medium">PASS</span>
              </SectionTitle>
              <p className="text-3xl text-nasun-white/90 text-center tracking-[0.2em] uppercase mt-2">
                COMING SOON
              </p>
            </FadeInUp>
          </div>

          <div className="hidden md:flex absolute bottom-20 inset-x-0 z-20 px-4 justify-center">
            <div className="w-full max-w-3xl grid grid-cols-2 gap-3">
              {activePhases.map((phase, i) => (
                <FadeInUp key={phase.label} delay={`${0.2 + i * 0.1}s`}>
                  <CountdownTimer
                    label={phase.label}
                    price={phase.price}
                    targetTimeUTC={phase.targetTimeUTC}
                    timeLeft={
                      countdowns[i] ?? {
                        days: 0,
                        hours: 0,
                        minutes: 0,
                        seconds: 0,
                      }
                    }
                    isExpired={countdowns[i]?.isExpired ?? false}
                  />
                </FadeInUp>
              ))}
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-4 inset-x-0 z-30 hidden md:flex justify-center">
            <svg
              className="w-6 h-6 text-nasun-white/50 animate-bounce"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}
