import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { ButtonV4 } from "@/components/ui/button-v4";
import { FadeInUp } from "@/components/ui/FadeInUp";

interface Hero2026SectionProps {
  videoSrc?: string;
  /** Negative top offset to crop the video from the top. E.g. "-15%" or "-120px" */
  videoTopCrop?: string;
}

function Hero2026Section({
  videoSrc = "/videos/Mediterranean-Website-4k-2-web.mp4",
  videoTopCrop = "-10vh",
}: Hero2026SectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const bgVideo = videoSrc;

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

  const containerClassName =
    "relative !p-0 mt-0 overflow-hidden h-full min-h-[calc(100dvh-50px)] flex items-center justify-center";

  return (
    <SectionLayout className={containerClassName}>
      {!isVideoPlaying && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <InlineLoading message="Loading..." size="lg" />
        </div>
      )}

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
          top: videoTopCrop || "0",
          height: videoTopCrop
            ? `calc(100% + ${videoTopCrop.replace(/^-/, "")})`
            : "100%",
        }}
      >
        <source src={bgVideo} type="video/mp4" />
      </video>

      {/* Content - always centered in section, pushed into lower half */}
      {isVideoPlaying && (
        <div className="relative z-20 w-full px-5 md:px-6 flex flex-col items-center text-center mt-[28vh] md:mt-[32vh] lg:mt-[36vh]">
          <FadeInUp>
            <div className="flex flex-col items-center">
              <h1
                className="text-white
             !font-changeling font-bold tracking-widest uppercase mb-1 md:mb-2 drop-shadow-[6px_6px_6px_rgba(0,0,0,0.8)] text-5xl md:text-6xl lg:text-7xl xl:text-8xl"
              >
                NASUN
              </h1>

              <h3 className="text-white font-medium mb-1 md:mb-2 drop-shadow-[4px_4px_4px_rgba(0,0,0,0.8)] text-xl md:text-2xl lg:text-3xl">
                Grow the Life You Own
              </h3>

              <p className=" text-white max-w-3xl my-3 md:my-5 lg:my-6 font-medium bg-clip-text drop-shadow-[4px_4px_4px_rgba(0,0,0,0.8)] text-base/snug md:text-lg/snug xl:text-xl/snug">
                <span className="block">
                  Nasun is infrastructure built around you.
                </span>
                <span className="block mt-2">
                  uju (우주, universe) is the OS powered by Nasun
                  <br className="hidden sm:block" /> that brings crypto, Web3,
                  and Web2
                  <br className="sm:hidden" /> into one experience on your
                  terms.
                </span>
                <span className="block mt-2">
                  One identity. Every app. <br className="sm:hidden" />
                  Everything you do compounds.
                </span>
              </p>

              <div className="relative inline-block mt-2 mb-2 md:mb-4 lg:mb-6">
                <Link to="/uju">
                  <ButtonV4
                    color="pado-mint"
                    size="lg"
                    className="min-w-[160px] md:min-w-[200px] drop-shadow-lg font-medium text-white"
                  >
                    Enter uju
                  </ButtonV4>
                </Link>
              </div>
            </div>
          </FadeInUp>
        </div>
      )}

      {/* Scroll indicator - always at viewport bottom */}
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
    </SectionLayout>
  );
}

export default Hero2026Section;
