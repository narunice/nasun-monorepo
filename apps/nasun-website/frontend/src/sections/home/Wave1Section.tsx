import React, { useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
const wave1VideoMP4 = "/videos/Home-Wave1-rf24.mp4";
const leaderboardVideoMP4 = "/videos/Leaderboard-Ui-rf22.mp4";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { ButtonV3 } from "@/components/ui/button-v3";

interface Wave1SectionV3Props {
  shouldLoadVideo?: boolean;
  onVideoReady?: () => void;
}

function Wave1SectionV3({ shouldLoadVideo = false, onVideoReady }: Wave1SectionV3Props) {
  const { t } = useTranslation("home");
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoSrc = wave1VideoMP4;

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

  const cards = [
    {
      titleKey: "wave1.leaderboard.title",
      line1Key: "wave1.leaderboard.line1",
      line2Key: "wave1.leaderboard.line2",
      ctaKey: "wave1.leaderboard.cta",
      to: "/wave1/leaderboard-guide",
    },
    {
      titleKey: "wave1.battalionNft.title",
      line1Key: "wave1.battalionNft.line1",
      line2Key: "wave1.battalionNft.line2",
      ctaKey: "wave1.battalionNft.cta",
      to: "/wave1/battalion-nft",
    },
    {
      titleKey: "wave1.earlyContributor.title",
      line1Key: "wave1.earlyContributor.line1",
      line2Key: "wave1.earlyContributor.line2",
      ctaKey: "wave1.earlyContributor.cta",
      to: "/wave1/early-contributors",
    },
  ] as const;

  return (
    <SectionLayout className="max-w-none relative min-h-screen">
      {/* Background video container */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full bg-nasun-black">
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
        <div className="relative z-20 flex flex-col lg:flex-row lg:gap-10 justify-center items-center lg:items-stretch max-w-xl lg:max-w-6xl mx-auto px-4 lg:px-0 mt-8 sm:mt-12 md:mt-16 lg:mt-20 mb-6 md:mb-12 lg:mb-14">
          {/* Left: intro + cards */}
          <div className="flex flex-col w-full lg:w-[50%] order-2 lg:order-1 mt-6 lg:mt-0">
            <p className="font-medium text-nasun-black/90 text-sm md:text-base mb-5 leading-relaxed">
              {t("wave1.intro")}
            </p>

            <div className="flex flex-col gap-4">
              {cards.map((card) => (
                <Link
                  key={card.to}
                  to={card.to}
                  className="block w-full group transition-all duration-300 ease-out"
                >
                  <div className="flex flex-col bg-white/70 backdrop-blur-sm rounded-lg p-5 md:p-6 border border-white/50 shadow-sm group-hover:bg-white/85 transition-colors">
                    <h6 className="mb-2 font-semibold text-nasun-black tracking-wide">
                      {t(card.titleKey)}
                    </h6>
                    <p className="text-nasun-black/80 text-xs md:text-sm leading-relaxed">
                      {t(card.line1Key)}
                      <br />
                      {t(card.line2Key)}
                    </p>
                    <div className="flex justify-end mt-3">
                      <ButtonV3 variant="gradient" size="sm" className="w-[160px]">
                        {t(card.ctaKey)}
                      </ButtonV3>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Right: title + video */}
          <div className="flex flex-col items-center lg:items-start w-full lg:w-[50%] order-1 lg:order-2">
            <h2 className="!font-eurostile text-3xl/tight md:text-4xl/tight lg:text-5xl/tight text-nasun-black/80 mb-1 lg:mb-2 tracking-wide w-full text-center">
              {t("wave1.title")}
            </h2>
            <p className="font-normal text-lg md:text-xl text-nasun-black/70 mb-4 lg:mb-6 w-full text-center">
              {t("wave1.tagline")}
            </p>
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-full max-w-lg lg:max-w-none object-contain rounded-md shadow-lg"
            >
              <source src={leaderboardVideoMP4} type="video/mp4" />
            </video>
          </div>
        </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default React.memo(Wave1SectionV3, (prev, next) => {
  return prev.shouldLoadVideo === next.shouldLoadVideo;
});
