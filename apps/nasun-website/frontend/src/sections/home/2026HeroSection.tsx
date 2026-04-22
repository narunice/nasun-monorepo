import { useState, useEffect } from "react";
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
  videoSrc = "/videos/Mediterranean-Website-web.mp4",

  videoTopCrop,
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
        className={`absolute inset-0 w-full h-full object-cover ${
          !isVideoPlaying ? "opacity-0" : "opacity-100"
        } transition-opacity duration-1000 z-0`}
        style={{ top: videoTopCrop || "0" }}
      >
        <source src={bgVideo} type="video/mp4" />
      </video>

      <div
        className="absolute inset-x-0 bottom-0 h-1/2 z-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.85) 100%, rgba(0,0,0,0.97) 100%)",
        }}
      />

      {/* Content - always centered in section, pushed into lower half */}
      {isVideoPlaying && (
        <div className="relative z-20 w-full px-5 md:px-6 flex flex-col items-center text-center mt-[36vh] md:mt-[40vh] lg:mt-[32vh]">
          <FadeInUp>
            <div className="flex flex-col items-center">
              <h1 className="text-white !font-changeling font-bold tracking-widest uppercase mb-1 md:mb-2 drop-shadow-lg">
                NASUN
              </h1>

              <h3 className="text-nasun-white font-medium mb-1 md:mb-2 drop-shadow-lg text-base md:text-xl lg:text-2xl">
                Grow the Life You Own
              </h3>

              <div className="max-w-3xl my-3 md:my-5 lg:my-6 space-y-2 drop-shadow-lg">
                <p className=" text-nasun-white text-sm md:text-lg lg:text-xl">
                  Nasun is infrastructure built around you.{" "}
                  <br className="sm:hidden" />
                  Not platforms. Not projects. You.
                </p>
                <p className=" text-nasun-white text-sm md:text-lg lg:text-xl">
                  uju (우주, universe) is the OS powered by Nasun
                  <br className="hidden sm:block" /> that brings crypto, Web3,
                  and Web2
                  <br className="sm:hidden" /> into one experience on your
                  terms.
                </p>
                <p className=" text-nasun-white text-sm md:text-lg lg:text-xl">
                  One identity. Every app. <br className="sm:hidden" />
                  Everything you do compounds.
                </p>
              </div>

              <ButtonV4
                color="light"
                size="lg"
                className="min-w-[160px] md:min-w-[200px] mt-2 mb-2 md:mb-4 lg:mb-6 drop-shadow-lg"
              >
                Enter uju
              </ButtonV4>
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
