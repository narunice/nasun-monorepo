import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { ButtonV4 } from "@/components/ui/button-v4";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { useAuth } from "@/features/auth";

interface Hero2026SectionProps {
  videoSrc?: string;
  /** Negative top offset to crop the video from the top (desktop only). E.g. "-15%" or "-120px" */
  videoTopCrop?: string;
}

function Hero2026Section({
  videoSrc = "/videos/Triangle-Hero-Section-BW-web.mp4",
  videoTopCrop,
}: Hero2026SectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const { isAuthenticated } = useAuth();

  const handleVideoCanPlay = () => {
    setIsVideoLoaded(true);
  };

  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
    if (!isVideoLoaded) setIsVideoLoaded(true);
  };

  // Timeout fallback
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isVideoLoaded) {
        setIsVideoLoaded(true);
        setIsVideoPlaying(true);
      }
    }, 5000);
    return () => clearTimeout(timeout);
  }, [isVideoLoaded]);

  const buttons = (
    <div className="flex items-center justify-center gap-3 md:gap-4">
      {isAuthenticated ? (
        <Link to="/my-account">
          <ButtonV4
            color="light"
            size="sm"
            className="py-1 drop-shadow-lg !font-inter !font-medium !text-lg"
          >
            Enter Nasun
          </ButtonV4>
        </Link>
      ) : (
        <ButtonV4
          color="light"
          size="sm"
          className="py-1 min-w-[100px] md:min-w-[120px] drop-shadow-lg !font-inter !font-medium !text-lg"
          onClick={() => {
            localStorage.setItem("auth_return_to", "/my-account");
            window.dispatchEvent(new Event("nasun:open-login"));
          }}
        >
          Enter Nasun
        </ButtonV4>
      )}

      {/* <ButtonV4
        color="ghost"
        size="sm"
        className="py-1 min-w-[100px] md:min-w-[120px] drop-shadow-lg !font-inter opacity-50 cursor-not-allowed !text-lg"
      >
        Read More
      </ButtonV4> */}
    </div>
  );

  return (
    <SectionLayout className="relative !p-0 mt-0 overflow-hidden">
      {!isVideoPlaying && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <InlineLoading message="Loading..." size="lg" />
        </div>
      )}

      {/* ── Desktop layout (≥ 1024px) ── */}
      <div className="hidden lg:flex relative h-full min-h-[calc(100dvh-50px)] items-center justify-center">
        {/* Full-bleed background video */}
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onCanPlay={handleVideoCanPlay}
          onPlaying={handleVideoPlaying}
          className={`absolute inset-x-0 w-full object-cover ${
            !isVideoPlaying ? "opacity-0" : "opacity-100"
          } transition-opacity duration-1000 z-0`}
          style={{
            top: videoTopCrop ?? "0",
            height: videoTopCrop
              ? `calc(100% + ${videoTopCrop.replace(/^-/, "")})`
              : "100%",
          }}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>

        {/* Content - right-aligned, vertically centered */}
        {isVideoPlaying && (
          <div className="z-20 w-full h-full absolute inset-0 flex items-center justify-end px-8 md:px-16 lg:px-24 xl:px-32">
            <FadeInUp>
              <div className="flex flex-col items-start max-w-xl text-left">
                <h1 className="-ml-0.5 !font-changeling font-bold tracking-widest uppercase text-white drop-shadow-[3px_3px_6px_rgba(0,0,0,0.7)] text-6xl md:text-7xl lg:text-[95px] xl:text-[107px] leading-none">
                  NASUN
                </h1>

                <p className="!font-pirulen text-white uppercase tracking-wide drop-shadow-[2px_2px_4px_rgba(0,0,0,0.8)] mb-4 md:mb-5">
                  MAKING YOU THE CENTER OF CRYPTO
                </p>

                <p className="!font-inter !font-light text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] text-sm md:text-base lg:text-lg leading-relaxed mb-6 md:mb-8">
                  Nasun turns your activity into compounding value.
                  <br />
                  Activate curated apps. Decide how deep you engage.
                  <br />
                  Nothing resets.
                </p>

                <div className="w-full flex justify-center">{buttons}</div>
              </div>
            </FadeInUp>
          </div>
        )}

        {/* Scroll indicator */}
        {isVideoPlaying && (
          <div className="absolute bottom-6 inset-x-0 z-30 flex justify-center">
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
        )}
      </div>

      {/* ── Mobile layout (< 1024px) ── */}
      <div className="flex lg:hidden flex-col bg-black">
        {/* Video block */}
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: "4.6 / 4" }}
        >
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            onCanPlay={handleVideoCanPlay}
            onPlaying={handleVideoPlaying}
            className={`absolute inset-0 w-full h-full object-cover object-left ${
              !isVideoPlaying ? "opacity-0" : "opacity-100"
            } transition-opacity duration-1000`}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>

          {/* Gradient inside container: transparent → black, ending solid at the bottom edge */}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-black pointer-events-none z-10" />
        </div>

        {/* Content overlaps with gradient zone */}
        {isVideoPlaying && (
          <div className="flex flex-col items-center text-center px-6 pb-16 z-20">
            <FadeInUp>
              <h1 className="!font-changeling font-bold tracking-widest uppercase text-white drop-shadow-[3px_3px_6px_rgba(0,0,0,0.7)] text-[72px] leading-none mb-3">
                NASUN
              </h1>

              <p className="!font-pirulen text-white uppercase tracking-wide drop-shadow-[2px_2px_4px_rgba(0,0,0,0.8)] mb-4 text-sm md:text-base">
                MAKING YOU THE CENTER OF CRYPTO
              </p>

              <p className="!font-inter !font-light text-white/80 text-sm md:text-base leading-relaxed mb-8">
                Nasun turns your activity into compounding value.
                <br />
                Activate curated apps. Decide how deep you engage.
                <br />
                Nothing resets.
              </p>

              {buttons}
            </FadeInUp>
          </div>
        )}
      </div>
    </SectionLayout>
  );
}

export default Hero2026Section;
