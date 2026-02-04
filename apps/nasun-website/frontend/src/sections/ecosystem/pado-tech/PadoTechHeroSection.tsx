import React, { useState, useEffect } from "react";

import { InlineLoading } from "@/components/ui/InlineLoading";
import waldenVideoDesktop from "../../../assets/videos/walden-hero-token-desktop.mp4";
import waldenVideoMobile from "../../../assets/videos/Walden-Dex-Token-Mobile-rf18.mp4";
import { Button } from "@/components/ui";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { useTranslation } from "react-i18next";

interface PadoTechHeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

function PadoTechHeroSection({ onVideoReady }: PadoTechHeroSectionProps) {
  const { t } = useTranslation("pado-tech");
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
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

  const containerClassName = `relative !p-0 -mt-14 md:mt-0 mx-auto flex items-center justify-center bg-nasun-black ${!isVideoPlaying ? "h-screen" : ""}`;

  return (
    <div className={containerClassName}>
      {!isVideoPlaying && (
        <div className="absolute inset-0 bg-nasun-black flex items-center justify-center z-20">
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
          background: "linear-gradient(to bottom, transparent 66%, rgb(25, 22, 21) 100%)",
        }}
      />

      {isVideoPlaying && (
        <div className="absolute inset-0 max-w-9xl mx-auto pointer-events-none">
          <div
            className="absolute
            bottom-[15%] sm:bottom-[30%] left-0 right-0
            md:bottom-[15%] lg:bottom-[15%] xl:bottom-[20%] 2xl:bottom-[25%] md:pl-[35%] lg:pl-[38%] xl:pl-[41%] md:-translate-y-1/2
            flex flex-col items-center text-center px-4 pointer-events-auto"
          >
            <FadeInUp>
              <h2>{t("hero.tagline")}</h2>
              <h4 className="text-nasun-white/70 text-[19px] md:text-[22px] lg:text-[31px]">
                {t("hero.subTagline")}
              </h4>
              <Button variant="white" size="lg" asChild className="mt-6">
                <Link to={import.meta.env.VITE_PADO_ALPHA_URL} target="_blank" rel="noopener noreferrer">
                  {t("hero.button")}
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </FadeInUp>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(PadoTechHeroSection);
