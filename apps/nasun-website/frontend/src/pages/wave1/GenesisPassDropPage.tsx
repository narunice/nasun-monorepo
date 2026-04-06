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

  // Apply genesis-drop-theme to html for footer black background
  useEffect(() => {
    document.documentElement.classList.add("genesis-drop-theme");
    return () =>
      document.documentElement.classList.remove("genesis-drop-theme");
  }, []);

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
            "linear-gradient(180deg, #000000 0%, #0a0a0a 50%, #000000 100%)",
        }}
      >
        {/* Hero section */}
        <div className="relative w-full min-h-screen overflow-hidden flex items-center justify-center">
          {/* Video background or poster fallback */}
          {/* Mobile: -mt-[15%] crops top of video, desktop: normal */}
          {skipVideo ? (
            <img
              src="/images/posters/Canyons-X-Post-web.webp"
              alt=""
              className="absolute inset-0 w-full min-h-full object-cover max-w-[1920px] mx-auto -mt-[15%] md:mt-0"
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
                className={`absolute inset-0 w-full h-full object-cover min-h-full max-w-[1920px] left-1/2 -translate-x-1/2 -mt-[15%] md:mt-0 transition-opacity duration-500 ${
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
                "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 25%, transparent 60%, rgba(0,0,0,0.25) 72%, rgba(0,0,0,0.6) 85%, rgb(0,0,0) 95%)",
            }}
          />
          {/* Mobile: solid fill below video area to extend hero */}
          <div
            className="absolute bottom-0 left-0 right-0 h-[30%] pointer-events-none z-[9] md:hidden"
            style={{
              background:
                "linear-gradient(to bottom, transparent 0%, rgb(0,0,0) 15%)",
            }}
          />

          {/* Mobile: title positioned via top padding from video center */}
          <div className="md:hidden relative z-20 flex items-center justify-center h-screen px-4 pt-[5vh]">
            <FadeInUp>
              <SectionTitle as="h1" className="text-center">
                <span className="!font-changeling font-bold tracking-widest">
                  GENESIS
                </span>{" "}
                <span className="!font-changeling font-medium tracking-widest">
                  PASS
                </span>
              </SectionTitle>
              <p className="text-xl text-nasun-white/90 text-center tracking-[0.2em] uppercase mt-2">
                COMING SOON
              </p>
            </FadeInUp>
          </div>

          {/* Desktop: flex column layout, no absolute positioning */}
          <div className="hidden md:flex relative z-20 flex-col items-center justify-center h-screen px-4">
            <div className="flex-1 flex items-end pb-6">
              <FadeInUp>
                <SectionTitle as="h1" className="!mb-0">
                  <span className="!font-changeling font-bold tracking-widest">
                    GENESIS
                  </span>{" "}
                  <span className="!font-changeling font-medium tracking-widest">
                    PASS
                  </span>
                </SectionTitle>
                <p className="text-3xl text-nasun-white/90 text-center tracking-[0.2em] uppercase mt-2">
                  COMING SOON
                </p>
              </FadeInUp>
            </div>

            <div className="w-full max-w-4xl grid grid-cols-2 gap-3 pb-6 mb-6 mt-4">
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

            {/* Scroll indicator */}
            <div className="pb-6">
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

        {/* Mobile: countdown timers on black bg, outside hero */}
        <div className="md:hidden relative z-30 bg-black px-6 pb-20 -mt-[18vh]">
          <div className="max-w-sm mx-auto grid grid-cols-1 gap-2">
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

        {/* Drop Details Section */}
        <div className="bg-black px-6 md:px-8 py-16 md:py-24">
          <div className="max-w-[840px] mx-auto space-y-12">
            {/* Schedule & Price */}
            <FadeInUp>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-nasun-white mb-6">
                  Updated Schedule (UTC) &amp; Price
                </h2>
                <ul className="space-y-2 text-nasun-white/80 text-sm md:text-base">
                  <li className="flex items-start gap-2">
                    <span className="text-nasun-white/40 mt-0.5">&#8226;</span>
                    <span>
                      <strong className="text-nasun-white">Free Mint:</strong>{" "}
                      April 7th — 3:00 PM UTC
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-nasun-white/40 mt-0.5">&#8226;</span>
                    <span>
                      <strong className="text-nasun-white">
                        GTD Allowlist:
                      </strong>{" "}
                      April 8th — 3:00 AM UTC @ ~$8 in ETH
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-nasun-white/40 mt-0.5">&#8226;</span>
                    <span>
                      <strong className="text-nasun-white">
                        FCFS Allowlist:
                      </strong>{" "}
                      April 8th — 3:00 PM UTC @ ~$10 in ETH
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-nasun-white/40 mt-0.5">&#8226;</span>
                    <span>
                      <strong className="text-nasun-white">Public Mint:</strong>{" "}
                      April 9th — 3:00 PM UTC @ ~$15 in ETH
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-nasun-white/40 mt-0.5">&#8226;</span>
                    <span>
                      <strong className="text-nasun-white">Mint closes:</strong>{" "}
                      April 14th — 3:00 PM UTC
                    </span>
                  </li>
                </ul>
              </div>
            </FadeInUp>

            {/* Supply Info */}
            <FadeInUp delay="0.2s">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-nasun-white mb-4">
                  Supply is limited by time, not by number.
                </h2>
                <div className="space-y-4 text-nasun-white/80 text-sm md:text-base leading-relaxed">
                  <p>
                    There is no fixed supply cap. The mint window is what
                    determines how many Genesis Passes exist. Once the window
                    closes, minting ends.
                  </p>
                  <p>
                    This changes how the allowlist works: GTD and FCFS are no
                    longer about guaranteed access vs. limited slots - everyone
                    can mint. The difference is now price. GTD allowlist gets
                    early access at $8 (20% off original), FCFS allowlist at
                    $10, and Public at $15.
                  </p>
                  <p>
                    If you're on the FCFS allowlist, make sure to mint before
                    Public opens to lock in your price at $10. <br />
                    After that, it's $15 for everyone.
                  </p>
                </div>
              </div>
            </FadeInUp>

            {/* Ethereum Mainnet */}
            <FadeInUp delay="0.3s">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-nasun-white mb-4">
                  Ethereum Mainnet
                </h2>
                <p className="text-nasun-white/80">
                  The Genesis Pass is an Ethereum Mainnet NFT, minted on Nasun
                  website. <br />
                  After the drop ends, it will be freely tradeable on OpenSea.
                </p>
              </div>
            </FadeInUp>
          </div>
        </div>
      </div>
    </>
  );
}
