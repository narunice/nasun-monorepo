import React, { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import wave1VideoPcMP4 from "../../../assets/videos/home-wave1-wave-light-desktop.mp4";
import wave1VideoMobileMP4 from "../../../assets/videos/home-wave1-wave-light-mobile.mp4";
import leaderboardDark from "../../../assets/images/home-leaderboard-light.jpg";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ActionLink } from "../../ui/ActionLink";
import { Tag } from "@/components/ui/tag";

/**
 * Wave1SectionV2 - Enhanced WAVE 1 section
 *
 * Improvements over V1:
 * - Stronger Glassmorphism effect (backdrop-blur)
 * - Micro-interactions (hover lift + shadow enhancement)
 * - Same layout as original (left cards + right image)
 * - Same light color scheme
 */
function Wave1SectionV2() {
  const { t } = useTranslation("home");
  const [isMobile, setIsMobile] = useState(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Detect mobile device (< 768px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Select video source based on device
  const videoSrc = isMobile ? wave1VideoMobileMP4 : wave1VideoPcMP4;

  // Video autoplay handling (iOS support)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      video.play().catch(() => {});
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    if (video.readyState >= 1) {
      video.play().catch(() => {});
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, []);

  // IntersectionObserver - play when visible, pause when not
  useEffect(() => {
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
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Enhanced card styles with hover effects
  const cardBaseStyles = `
    w-full rounded-xl p-4 md:p-5 lg:p-6
    bg-nasun-white/90 backdrop-blur-md
    border border-nasun-white/80
    shadow-lg
    transition-all duration-300 ease-out
    hover:-translate-y-1 hover:shadow-xl hover:bg-nasun-white/95
  `;

  return (
    <SectionLayout className="max-w-none relative min-h-screen">
      {/* Background video container */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full">
        {/* Background video */}
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
      <div className="relative max-w-8xl mx-auto z-20 h-full">
        {/* WAVE 1 Title */}
        <SectionTitle
          as="h2"
          color="scarlet"
          className="!font-eurostile text-center mt-6 mb-2 sm:my-4 md:my-6 lg:mt-8 xl:mt-10"
        >
          {t("wave1.title")}
        </SectionTitle>

        {/* Content - Same layout as original */}
        <div className="flex flex-col lg:flex-row-reverse lg:gap-12 mb-6 md:mb-12 lg:mb-14">
          {/* Leaderboard image (mobile: top, desktop: right) */}
          <div className="flex items-center justify-center lg:w-1/2 lg:justify-end">
            <div className="w-full max-w-xl lg:max-w-none group">
              <img
                src={leaderboardDark}
                alt="Leaderboard Preview"
                className="w-auto max-h-[560px] rounded-xl shadow-lg border border-nasun-white
                         transition-all duration-500
                         group-hover:shadow-2xl group-hover:scale-[1.02]"
              />
            </div>
          </div>

          {/* Text boxes (mobile: bottom, desktop: left) */}
          <div className="flex flex-col gap-6 lg:justify-between items-center max-w-xl mt-6 lg:mt-0 mx-auto lg:mx-0 lg:w-1/2">
            {/* LEADERBOARD Box */}
            <div className={cardBaseStyles}>
              <Tag variant="outlineC5" size="md" className="items-start font-medium">
                {t("wave1.leaderboard.title")}
              </Tag>
              <p className="text-base text-nasun-black/80 pt-4">
                {t("wave1.leaderboard.description")}
              </p>
              <div className="flex justify-end pt-4">
                <ActionLink
                  to="/wave1/leaderboard-info"
                  variant="actionDark"
                  className="px-6 py-3 transition-transform duration-200 hover:scale-105"
                >
                  {t("wave1.leaderboard.cta")}
                </ActionLink>
              </div>
            </div>

            {/* BATTALION NFT Box */}
            <div className={cardBaseStyles}>
              <Tag variant="outlineC5" size="md" className="items-start font-medium">
                {t("wave1.battalionNft.title")}
              </Tag>
              <p className="text-base text-nasun-black/80 pt-4">
                {t("wave1.battalionNft.description")}
              </p>
              <div className="flex justify-end pt-4">
                <ActionLink
                  to="/wave1/battalion-nft"
                  variant="actionDark"
                  className="px-6 py-3 transition-transform duration-200 hover:scale-105"
                >
                  {t("wave1.battalionNft.cta")}
                </ActionLink>
              </div>
            </div>

            {/* EARLY CONTRIBUTOR Box */}
            <div className={cardBaseStyles}>
              <Tag variant="outlineC5" size="md" className="items-start font-medium">
                {t("wave1.earlyContributor.title")}
              </Tag>
              <p className="text-base text-nasun-black/80 pt-4">
                {t("wave1.earlyContributor.description")}
              </p>
              <div className="flex justify-end pt-4">
                <ActionLink
                  to="/wave1/early-contributors"
                  variant="actionDark"
                  className="px-6 py-3 transition-transform duration-200 hover:scale-105"
                >
                  {t("wave1.earlyContributor.cta")}
                </ActionLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(Wave1SectionV2);
