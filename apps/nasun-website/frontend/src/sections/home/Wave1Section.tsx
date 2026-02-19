import React, { useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import wave1VideoMP4 from "../../assets/videos/Home-Wave1-rf24.mp4";
import leaderboardVideoMP4 from "../../assets/videos/Leaderboard-Ui-rf22.mp4";
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
          {/* Left: Cards */}
          <div className="flex flex-col gap-5 w-full lg:w-[50%] mt-6 lg:mt-0 order-2 lg:order-1">
            {/* LEADERBOARD */}
            <Link
              to="/wave1/leaderboard-info"
              className="block w-full flex-1 group transition-all duration-300 ease-out"
            >
              <div className="h-full flex flex-col bg-white/70 backdrop-blur-sm rounded-lg p-5 md:p-6 border border-white/50 shadow-sm group-hover:bg-white/85 transition-colors">
                <h6 className="mb-2 uppercase font-medium text-nasun-black tracking-wide">
                  LEADERBOARD
                </h6>
                <p className="flex-1 text-nasun-black/90 ">
                  Climb ranks to unlock Launch Pool access and Battalion NFT eligibility
                  <br />
                  Complete tasks: Follow on X, create content, test features
                </p>
                <div className="flex justify-end mt-auto pt-3">
                  <ButtonV3 variant="gradient" size="sm" className="w-[160px]">
                    {t("wave1.leaderboard.cta")}
                  </ButtonV3>
                </div>
              </div>
            </Link>

            {/* BATTALION NFT */}
            <Link
              to="/wave1/battalion-nft"
              className="block w-full flex-1 group transition-all duration-300 ease-out"
            >
              <div className="h-full flex flex-col bg-white/70 backdrop-blur-sm rounded-lg p-5 md:p-6 border border-white/50 shadow-sm group-hover:bg-white/85 transition-colors">
                <h6 className="mb-2 uppercase font-medium text-nasun-black tracking-wide">
                  BATTALION NFT
                </h6>
                <p className="flex-1 text-nasun-black/90">
                  Boost rewards by staking on Devnet/Testnet with Battalion NFT multipliers.
                  <br />
                  Earn toward Mainnet $NSN airdrop, alpha access, and exclusive giveaways.
                </p>
                <div className="flex justify-end mt-auto pt-3">
                  <ButtonV3 variant="gradient" size="sm" className="w-[160px]">
                    {t("wave1.battalionNft.cta")}
                  </ButtonV3>
                </div>
              </div>
            </Link>

            {/* EARLY CONTRIBUTORS */}
            <Link
              to="/wave1/early-contributors"
              className="block w-full flex-1 group transition-all duration-300 ease-out"
            >
              <div className="h-full flex flex-col bg-white/70 backdrop-blur-sm rounded-lg p-5 md:p-6 border border-white/50 shadow-sm group-hover:bg-white/85 transition-colors">
                <h6 className="mb-2 uppercase font-medium text-nasun-black tracking-wide">
                  EARLY CONTRIBUTORS
                </h6>
                <p className="flex-1 text-nasun-black/90 ">
                  Limited spots for builders and creators
                  <br />
                  Launch pool allocation and Rare Battalion NFTs with exclusive utilities
                </p>
                <div className="flex justify-end mt-auto pt-3">
                  <ButtonV3 variant="gradient" size="sm" className="w-[160px]">
                    {t("wave1.earlyContributor.cta")}
                  </ButtonV3>
                </div>
              </div>
            </Link>
          </div>

          {/* Right: WAVE 1 title + Leaderboard image */}
          <div className="flex flex-col items-center lg:items-start lg:justify-between w-full lg:w-[50%] order-1 lg:order-2">
            <h2 className="!font-eurostile text-3xl/tight md:text-4xl/tight lg:text-5xl/tight text-nasun-black/80 mb-4 lg:mb-6 lg:-mt-4 tracking-wide whitespace-nowrap w-full text-center">
              WAVE 1
            </h2>
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
