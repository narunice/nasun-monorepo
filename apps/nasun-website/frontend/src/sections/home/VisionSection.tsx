import React, { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { useIsMobile } from "@/hooks/useIsMobile";

const visionVideoDesktop = "/videos/Home-Wave1-rf24.mp4";
const visionVideoMobile = "/videos/Home-Wave1-mobile-rf28.mp4";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { ButtonV3 } from "@/components/ui/button-v3";
import visionTriangle from "../../assets/images/home-vision-triangle.png";

interface VisionSectionV2Props {
  shouldLoadVideo?: boolean;
  onVideoReady?: () => void;
}

function VisionSectionV2({ shouldLoadVideo = false, onVideoReady }: VisionSectionV2Props) {
  const { t } = useTranslation("home");
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMobile = useIsMobile();

  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
  };

  const videoSrc = isMobile ? visionVideoMobile : visionVideoDesktop;

  // Video autoplay handling for iOS
  useEffect(() => {
    if (!shouldLoadVideo) return;

    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      video.play().catch(() => {});
      onVideoReady?.();
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    if (video.readyState >= 1) {
      video.play().catch(() => {});
      onVideoReady?.();
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [shouldLoadVideo, onVideoReady]);

  // IntersectionObserver - play/pause based on visibility
  useEffect(() => {
    if (!shouldLoadVideo) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = videoRef.current;
          if (entry.isIntersecting) {
            video?.play().catch(() => {});
          } else {
            video?.pause();
          }
        });
      },
      { threshold: 0.1 },
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [shouldLoadVideo]);

  return (
    <SectionLayout className="max-w-none relative min-h-screen">
      {/* Background video container */}
      <div
        ref={containerRef}
        className="absolute inset-0 bg-nasun-white"
      >
        {shouldLoadVideo && (
          <video
            key={videoSrc}
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            webkit-playsinline="true"
            preload="none"
            poster="/images/posters/Home-Wave1-rf28.webp"
            x-webkit-airplay="allow"
            onPlaying={handleVideoPlaying}
            className={`absolute top-0 left-0 w-full h-full object-cover object-center transition-opacity duration-500 ${
              isVideoPlaying ? "opacity-100" : "opacity-0"
            }`}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        )}
      </div>

      {/* Content */}
      <div className="relative z-30 flex flex-col items-center justify-center min-h-screen px-4 lg:px-8">
        {/* Main row: Triangle + Text */}
        <div className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-20 xl:gap-28 w-full">
          {/* Left: Triangle Symbol */}
          <div className="flex items-center justify-center lg:justify-end pt-16 lg:pt-0 lg:flex-[2]">
            <FadeInUp delay="0.1s">
              <img
                src={visionTriangle}
                alt="Nasun"
                className="w-56 md:w-64 lg:w-full lg:max-w-96 brightness-110"
              />
            </FadeInUp>
          </div>

          {/* Right: Text Content */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left gap-2 lg:gap-3 lg:flex-[3] min-w-0">
            {/* NASUN Wordmark */}
            <FadeInUp delay="0.2s">
              <h1 className="!font-changeling font-bold tracking-wider text-nasun-black/80 -mt-4 text-[50px] md:text-[61px] lg:text-[73px] ">
                NASUN
              </h1>
            </FadeInUp>

            {/* Categories */}
            <FadeInUp delay="0.3s">
              <h5 className="font-medium text-nasun-black/80 -mt-4 !tracking-normal">
                The Infrastructure Layer <br />
                Finance &bull; AI &bull; Entertainment
              </h5>
            </FadeInUp>

            {/* Description */}
            <FadeInUp delay="0.5s">
              <h6 className="font-medium text-nasun-black/60 mt-0 md:mt-1 lg:mt-2 xl:max-w-none">
                Communities build, own, and grow IP together
              </h6>
            </FadeInUp>

            {/* CTA Buttons */}
            <div className="lg:self-stretch lg:w-full">
              <FadeInUp delay="0.6s">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4 mt-1 lg:mt-2 max-w-xs lg:max-w-none mx-auto lg:mx-0 xl:w-auto xl:flex xl:flex-row">
                  <ButtonV3
                    variant="gradient"
                    size="lg"
                    asChild
                    className="lg:px-4 xl:px-12 xl:w-[280px]"
                  >
                    <Link to="/network/nsn">{t("vision.cta.unifiedVision")}</Link>
                  </ButtonV3>
                  <ButtonV3
                    variant="nw1"
                    outline
                    size="lg"
                    asChild
                    className="lg:px-4 xl:px-12 xl:w-[280px]"
                  >
                    <Link to="/about/litepaper">{t("vision.cta.signUp")}</Link>
                  </ButtonV3>
                </div>
              </FadeInUp>
            </div>
          </div>
        </div>

        {/* Tagline */}
        {/*
        <FadeInUp delay="0.7s">
          <p className="font-medium text-lg/snug md:text-xl/snug xl:text-2xl/snug text-nasun-black/80 text-center max-w-4xl mx-auto mt-16 lg:mt-20">
            Building the next generation of global IP
            <br className="lg:hidden" /> through coordinated creation.
          </p>
        </FadeInUp>
        */}
      </div>

    </SectionLayout>
  );
}

export default React.memo(VisionSectionV2, (prev, next) => {
  return prev.shouldLoadVideo === next.shouldLoadVideo;
});
