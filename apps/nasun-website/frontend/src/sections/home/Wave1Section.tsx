import React, { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { useIsMobile } from "@/hooks/useIsMobile";

const wave1VideoDesktop = "/videos/Home-Wave1-rf24.mp4";
const wave1VideoMobile = "/videos/Home-Wave1-mobile-rf28.mp4";
const allianceNftImage = "/images/posters/Alliance-NFT-Event-Website-Princess-Kaebo.webp";
const trianglePlanetImage = "/images/posters/Triangle-Planet-Website.webp";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { ButtonV3 } from "@/components/ui/button-v3";

interface Wave1SectionV3Props {
  shouldLoadVideo?: boolean;
  onVideoReady?: () => void;
}

function Wave1SectionV3({ shouldLoadVideo = false, onVideoReady }: Wave1SectionV3Props) {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMobile = useIsMobile();

  const videoSrc = isMobile ? wave1VideoMobile : wave1VideoDesktop;
  const showcaseImages = [allianceNftImage, trianglePlanetImage];
  const [showcaseIndex, setShowcaseIndex] = useState(0);

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

  // Rotate showcase images every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setShowcaseIndex((prev) => (prev + 1) % showcaseImages.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [showcaseImages.length]);

  const cards = [
    {
      title: "Alliance NFT Free Mint",
      line1: "Earn points: daily missions, access games and the DeFi platform, climb our ecosystem leaderboards.",
      line2: "Active holders may also qualify for future points airdrops.",
      cta: "Mint Now",
      to: "/dev/alliance-nft",
      disabled: true,
    },
    {
      title: "Genesis Pass",
      line1: "Activate to earn daily points.",
      line2: "Boost points 2x for ecosystem activities and qualification for future airdrops.",
      cta: "Join the Allowlist",
      to: "/wave1/genesis-pass",
      disabled: false,
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
            preload="none"
            poster="/images/posters/Home-Wave1-rf28.webp"
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
              transform: "scaleX(-1)",
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
        <div className="relative z-20 flex flex-col items-center max-w-xl lg:max-w-6xl mx-auto px-4 lg:px-0 mt-8 sm:mt-12 md:mt-16 lg:mt-20 mb-6 md:mb-12 lg:mb-14">
          {/* Title + Tagline (top center) */}
          <h2 className="!font-eurostile text-3xl/tight md:text-4xl/tight lg:text-5xl/tight text-nasun-black/80 tracking-wide text-center">
            WAVE 1
          </h2>
          <p className="font-normal text-lg md:text-xl text-nasun-black/70 mb-6 lg:mb-10 text-center">
            Build With Us From Day 1
          </p>

          {/* Two-column layout: cards + image */}
          <div className="flex flex-col lg:flex-row lg:gap-10 justify-center items-center w-full max-w-5xl mx-auto">
            {/* Left: cards (wider) */}
            <div className="flex flex-col w-full lg:w-[58%] order-2 lg:order-1 mt-6 lg:mt-0">
              <div className="flex flex-col gap-6 lg:gap-8">
                {cards.map((card) => {
                  const inner = (
                    <div className="flex flex-col bg-white/70 backdrop-blur-sm rounded-lg p-5 md:p-6 border border-white/50 shadow-sm group-hover:bg-white/85 transition-colors">
                      <h6 className="mb-2 font-semibold text-nasun-black tracking-wide">
                        {card.title}
                      </h6>
                      <p className="text-nasun-black/80 text-xs md:text-sm leading-relaxed">
                        {card.line1}
                        <br />
                        {card.line2}
                      </p>
                      <div className="flex justify-end mt-3">
                        <ButtonV3 variant="gradient" size="sm" className="w-[160px]" disabled={card.disabled}>
                          {card.cta}
                        </ButtonV3>
                      </div>
                    </div>
                  );
                  if (card.disabled) {
                    return (
                      <div key={card.to} className="block w-full group transition-all duration-300 ease-out">
                        {inner}
                      </div>
                    );
                  }
                  return (
                    <Link key={card.to} to={card.to} className="block w-full group transition-all duration-300 ease-out">
                      {inner}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Right: rotating showcase images */}
            <div className="relative order-1 lg:order-2 w-full lg:w-[38%] max-w-xs sm:max-w-sm shrink-0">
              {showcaseImages.map((src, i) => (
                <img
                  key={src}
                  src={src}
                  alt={`Showcase ${i + 1}`}
                  className={`w-full h-auto rounded-md shadow-lg transition-opacity duration-700 ${
                    i === showcaseIndex ? "opacity-100" : "opacity-0"
                  } ${i === 0 ? "relative" : "absolute inset-0"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default React.memo(Wave1SectionV3, (prev, next) => {
  return prev.shouldLoadVideo === next.shouldLoadVideo;
});
