import React, { useState, useEffect } from "react";

import { InlineLoading } from "@/components/ui/InlineLoading";
import { useIsMobile } from "@/hooks/useIsMobile";

const waldenVideoDesktop = "/videos/Walden-Dex-Token-rf28.mp4";
const waldenVideoMobile = "/videos/Walden-Dex-Token-mobile-rf28.mp4";

import { FadeInUp } from "@/components/ui/FadeInUp";

interface FinanceHeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

function FinanceHeroSection({ onVideoReady }: FinanceHeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    setIsVideoLoaded(false);
    setIsVideoPlaying(false);
  }, [isMobile]);

  const handleVideoCanPlay = () => {
    setIsVideoLoaded(true);
    onVideoReady?.();
  };

  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
    if (!isVideoLoaded) {
      setIsVideoLoaded(true);
      onVideoReady?.();
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isVideoLoaded) {
        setIsVideoLoaded(true);
        setIsVideoPlaying(true);
        onVideoReady?.();
      }
    }, 5000);
    return () => clearTimeout(timeout);
  }, [isVideoLoaded, onVideoReady]);

  const containerClassName = `relative !p-0 -mt-14 md:mt-0 mx-auto bg-[#080c16] overflow-hidden ${!isVideoPlaying ? "h-screen flex items-center justify-center" : "min-h-[70vh] landscape:min-h-screen md:!min-h-0 md:!h-auto"}`;

  return (
    <div className={containerClassName}>
      {!isVideoPlaying && (
        <div className="absolute inset-0 bg-[#080c16] flex items-center justify-center z-20">
          <InlineLoading message="Loading..." size="lg" />
        </div>
      )}

      <video
        key={isMobile ? "mobile" : "desktop"}
        preload="auto"
        autoPlay
        loop
        muted
        playsInline
        poster="/images/posters/Walden-Dex-Token-rf28.webp"
        onCanPlay={handleVideoCanPlay}
        onPlaying={handleVideoPlaying}
        className={`block w-full ${isMobile ? "h-full" : ""} ${!isVideoPlaying ? "opacity-0" : "opacity-100"} transition-opacity duration-500`}
        style={isMobile ? { objectFit: "cover" as const, objectPosition: "center 10%" } : undefined}
      >
        <source src={isMobile ? waldenVideoMobile : waldenVideoDesktop} type="video/mp4" />
      </video>

      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: "linear-gradient(to bottom, transparent 66%, rgb(8, 12, 22) 100%)",
        }}
      />

      {isVideoPlaying && (
        <div className="absolute inset-0 max-w-9xl mx-auto pointer-events-none z-20">
          <div
            className="absolute
            bottom-[15%] left-0 right-0
            md:bottom-[10%] xl:bottom-[25%] 2xl:bottom-[30%] md:pl-[38%] xl:pl-[41%] md:-translate-y-1/2
            flex flex-col items-center
            text-center
            px-4
            pointer-events-auto"
          >
            <FadeInUp>
              <div className="text-center md:text-left pr-0 md:pr-10">
                <h2 className="!font-pirulen uppercase -mb-1 text-white lg:text-4xl xl:text-5xl">PADO</h2>
                <h3 className="font-medium text-nasun-white uppercase lg:text-3xl xl:text-4xl">Unified Onchain Finance</h3>
                <h5 className="!text-nasun-white/60 lg:text-xl xl:text-2xl">
                  Performance without custody
                  <br />
                  Control without compromise
                </h5>
              </div>
            </FadeInUp>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(FinanceHeroSection);
