import React, { useState, useEffect } from "react";

import { InlineLoading } from "@/components/ui/InlineLoading";
const waldenVideoDesktop = "/videos/walden-hero-token-desktop.mp4";
const waldenVideoMobile = "/videos/Walden-Dex-Token-Mobile-rf18.mp4";

import { FadeInUp } from "@/components/ui/FadeInUp";

interface FinanceHeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

function FinanceHeroSection({ onVideoReady }: FinanceHeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  const containerClassName = `relative !p-0 -mt-14 lg:mt-0 mx-auto flex items-center justify-center bg-[#080c16] ${!isVideoPlaying ? "h-screen" : ""}`;

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
        onCanPlay={handleVideoCanPlay}
        onPlaying={handleVideoPlaying}
        className={`w-full h-full max-w-9xl ${!isVideoPlaying ? "opacity-0" : "opacity-100"} ${
          isMobile ? "-mt-2 sm:-mt-24" : ""
        } transition-opacity duration-500`}
        style={{
          objectFit: isMobile ? "cover" : "contain",
          objectPosition: "center center",
        }}
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
        <div className="absolute inset-0 max-w-9xl mx-auto pointer-events-none">
          <div
            className="absolute
            bottom-[15%] sm:bottom-[30%] left-0 right-0
            lg:bottom-[10%] xl:bottom-[25%] 2xl:bottom-[30%] lg:pl-[38%] xl:pl-[41%] lg:-translate-y-1/2
            flex flex-col items-center
            text-center
            px-4
            pointer-events-auto"
          >
            <FadeInUp>
              <div className="text-left pr-6 md:pr-8 lg:pr-10">
                <h2 className="!font-pirulen uppercase -mb-1 text-white ">PADO</h2>
                <h3 className="font-medium text-nasun-white uppercase">Unified Onchain Finance</h3>
                <h5 className="!text-nasun-white/60 ">
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
