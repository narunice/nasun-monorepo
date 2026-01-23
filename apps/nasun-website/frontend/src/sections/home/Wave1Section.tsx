import React, { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import wave1VideoPcMP4 from "../../assets/videos/home-wave1-wave-light-desktop.mp4";
import wave1VideoMobileMP4 from "../../assets/videos/home-wave1-wave-light-mobile.mp4";
import leaderboardDesktop from "../../assets/images/leaderboard-ss.jpg";
import leaderboardMobile from "../../assets/images/leaderboard-ss2.jpg";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DividerBox } from "@/components/ui/DividerBox";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { Tag } from "@/components/ui/tag";

interface Wave1SectionV3Props {
  shouldLoadVideo?: boolean;
  onVideoReady?: () => void;
}

/**
 * Wave1SectionV3 - DividerBox version
 *
 * Uses DividerBox component instead of Tag for card titles.
 * - Same layout as original (left cards + right image)
 * - DividerBox with color="white" for light background
 * - Hover effects on cards and image
 */
function Wave1SectionV3({ shouldLoadVideo = false, onVideoReady }: Wave1SectionV3Props) {
  const { t } = useTranslation("home");
  const [isMobile, setIsMobile] = useState(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Detect mobile/tablet device (< 1024px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Select video and image source based on device
  const videoSrc = isMobile ? wave1VideoMobileMP4 : wave1VideoPcMP4;
  const leaderboardImage = isMobile ? leaderboardMobile : leaderboardDesktop;

  // Video autoplay handling (iOS support)
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

  // IntersectionObserver - play when visible, pause when not
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

  // Common DividerBox wrapper styles for hover effect
  const dividerBoxWrapperStyles = "transition-all duration-300 ease-out ";

  return (
    <SectionLayout className="max-w-none relative min-h-screen">
      {/* Background video container */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full bg-nasun-black">
        {/* Background video */}
        {shouldLoadVideo && (
          <video
            key={videoSrc}
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            webkit-playsinline="true"
            preload="metadata"
            x-webkit-airplay="allow"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              filter: "sepia(0.15) saturate(0.7) brightness(1)",
            }}
          >
            <source src={videoSrc} type="video/mp4" />
          </video>
        )}
        {/* Radial gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 0%, transparent 60%, rgba(0,0,0,0.4) 100%)",
          }}
        />
      </div>
      {/* Content */}
      <FadeInUp>
        <div className="relative z-20 h-full">
          {/* WAVE 1 Title */}
          <SectionTitle
            as="h2"
            color="black"
            className="!font-eurostile text-center mb-2 sm:mb-4 md:mb-6 lg:mb-8 xl:mb-10 mt-4 sm:mt-8 md:mt-14 lg:mt-18 xl:mt-20"
          >
            {t("wave1.title")}
          </SectionTitle>

          {/* Content - Centered layout */}
          <div className="flex flex-col lg:flex-row-reverse lg:gap-8 mb-6 md:mb-12 lg:mb-14 justify-center items-center lg:items-stretch max-w-xl lg:max-w-6xl mx-auto">
            {/* Leaderboard image (mobile: top, desktop: right) */}
            <div className="flex items-center justify-center w-full lg:w-[45%] px-4 lg:px-0">
              <div className="group h-full flex items-center w-full lg:w-auto">
                <img
                  src={leaderboardImage}
                  alt="Leaderboard Preview"
                  className="w-full lg:w-auto lg:max-h-full lg:h-full object-contain rounded-sm lg:rounded-none"
                />
              </div>
            </div>

            {/* DividerBox cards (mobile: bottom, desktop: left) */}
            <div className="flex flex-col gap-6 items-center mt-6 lg:mt-0 w-full lg:w-[55%] px-4 lg:px-0">
              {/* LEADERBOARD Box */}
              <Link
                to="/wave1/leaderboard-info"
                className={`block w-full flex-1 group ${dividerBoxWrapperStyles}`}
              >
                <DividerBox color="w1" padding="md" className="h-full !bg-nasun-black/85 flex flex-col">
                  <h6 className="mb-2 uppercase font-medium text-nasun-c1">
                    {t("wave1.leaderboard.title")}
                  </h6>
                  <p className="flex-1">{t("wave1.leaderboard.description")}</p>
                  <div className="flex justify-end mt-auto pt-3">
                    <Tag
                      variant="filledC1"
                      size="sm"
                      className="!border-none !bg-nasun-c1 text-nasun-black hover:!bg-nasun-c1/80 transition-all capitalize px-8"
                    >
                      {t("wave1.leaderboard.cta")}
                    </Tag>
                  </div>
                </DividerBox>
              </Link>

              {/* BATTALION NFT Box */}
              <Link
                to="/wave1/battalion-nft"
                className={`block w-full flex-1 group ${dividerBoxWrapperStyles}`}
              >
                <DividerBox color="w1" padding="md" className="h-full !bg-nasun-black/85 flex flex-col">
                  <h6 className="mb-2 uppercase font-medium text-nasun-c1">
                    {t("wave1.battalionNft.title")}
                  </h6>
                  <p className="flex-1">{t("wave1.battalionNft.description")}</p>
                  <div className="flex justify-end mt-auto pt-3">
                    <Tag
                      variant="filledC1"
                      size="sm"
                      className="!border-none !bg-nasun-c1 text-nasun-black hover:!bg-nasun-c1/80 transition-all capitalize px-8"
                    >
                      {t("wave1.battalionNft.cta")}
                    </Tag>
                  </div>
                </DividerBox>
              </Link>

              {/* EARLY CONTRIBUTOR Box */}
              <Link
                to="/wave1/early-contributors"
                className={`block w-full flex-1 group ${dividerBoxWrapperStyles}`}
              >
                <DividerBox color="w1" padding="md" className="h-full !bg-nasun-black/85 flex flex-col">
                  <h6 className="mb-2 uppercase font-medium text-nasun-c1">
                    {t("wave1.earlyContributor.title")}
                  </h6>
                  <p className="flex-1">{t("wave1.earlyContributor.description")}</p>
                  <div className="flex justify-end mt-auto pt-3">
                    <Tag
                      variant="filledC1"
                      size="sm"
                      className="!border-none !bg-nasun-c1 text-nasun-black hover:!bg-nasun-c1/80 transition-all capitalize px-8"
                    >
                      {t("wave1.earlyContributor.cta")}
                    </Tag>
                  </div>
                </DividerBox>
              </Link>
            </div>
          </div>
        </div>{" "}
      </FadeInUp>
    </SectionLayout>
  );
}

export default React.memo(Wave1SectionV3, (prev, next) => {
  return prev.shouldLoadVideo === next.shouldLoadVideo;
});
