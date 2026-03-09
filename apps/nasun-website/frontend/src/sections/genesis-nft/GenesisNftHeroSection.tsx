import React, { useState, useEffect, useRef, useCallback } from "react";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { useIsMobile } from "@/hooks/useIsMobile";

const genesisNftVideoDesktop = "/videos/Battalion-Nft-Leeterbox-01-rf25.mp4";
const genesisNftVideoMobile = "/videos/Battalion-Nft-White-Square-01-rf28.mp4";

interface GenesisNftHeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

// Title animation timing constants
const TITLE_START_TIME = 1.1;
const WORD_FADE_DURATION = 0.45;
const TITLE_END_TIME = 4.33;

/**
 * GenesisNftHeroSection 컴포넌트
 *
 * Genesis NFT 페이지의 Hero 섹션 - 배경 동영상과 타이틀
 */
function GenesisNftHeroSection({ onVideoReady }: GenesisNftHeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const isMobile = useIsMobile();
  const [titleVisible, setTitleVisible] = useState(false);
  const [wordOpacities, setWordOpacities] = useState([0, 0, 0]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const handleVideoCanPlay = () => {
    setIsVideoLoaded(true);
    onVideoReady?.();
  };

  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.readyState >= 3) {
      setIsVideoLoaded(true);
      onVideoReady?.();
    }

    video.play().then(() => {
      setIsVideoPlaying(true);
    }).catch(() => {
      // Autoplay blocked — 5초 timeout fallback이 처리
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateTitleAnimation = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const currentTime = video.currentTime;
    const duration = video.duration;
    void duration;

    if (currentTime >= TITLE_START_TIME && currentTime < TITLE_END_TIME) {
      setTitleVisible(true);

      const newOpacities = [0, 1, 2].map((index) => {
        const wordStartTime = TITLE_START_TIME + index * WORD_FADE_DURATION;
        const wordEndTime = wordStartTime + WORD_FADE_DURATION;

        if (currentTime < wordStartTime) return 0;
        if (currentTime >= wordEndTime) return 1;
        return (currentTime - wordStartTime) / WORD_FADE_DURATION;
      });

      setWordOpacities(newOpacities);
    } else {
      setTitleVisible(false);
      setWordOpacities([0, 0, 0]);
    }
  }, []);

  useEffect(() => {
    if (!isVideoPlaying) return;

    const animate = () => {
      updateTitleAnimation();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isVideoPlaying, updateTitleAnimation]);

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

  const containerClassName = isMobile
    ? `relative bg-nasun-black overflow-hidden ${!isVideoPlaying ? "h-screen" : ""}`
    : "relative flex items-start justify-center h-screen overflow-hidden bg-nasun-black";

  const videoClassName = isMobile
    ? `w-full ${!isVideoPlaying ? "opacity-0" : "opacity-100"} transition-opacity duration-500`
    : `-mt-20 max-w-9xl w-full min-h-[calc(100%+5rem)] object-cover object-center ${
        !isVideoPlaying ? "opacity-0" : "opacity-100"
      } transition-opacity duration-500`;

  return (
    <div className={containerClassName}>
      {!isVideoPlaying && (
        <div className="absolute inset-0 bg-nasun-black flex items-center justify-center z-20">
          <InlineLoading message="Loading..." size="lg" />
        </div>
      )}

      <video
        ref={videoRef}
        key={isMobile ? "mobile" : "desktop"}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster="/images/posters/Battalion-Nft-Leeterbox-01-rf25.webp"
        onCanPlay={handleVideoCanPlay}
        onPlaying={handleVideoPlaying}
        className={videoClassName}
      >
        <source
          src={isMobile ? genesisNftVideoMobile : genesisNftVideoDesktop}
          type="video/mp4"
        />
      </video>

      {/* Gradient Overlay */}
      <div
        className="absolute inset-0 -mb-[2px] pointer-events-none z-10"
        style={{
          background: "linear-gradient(to bottom, transparent 60%, rgb(25, 22, 21) 95%)",
        }}
      />

      {/* Title Overlay */}
      <div className={`absolute ${isMobile ? "bottom-[15%]" : "bottom-[23%]"} left-0 right-0 z-30`}>
        <div
          className={`flex ${isMobile ? "flex-col items-center" : "justify-center items-baseline gap-4"}`}
        >
          <h2
            className={`!font-changeling ${isMobile ? "text-3xl" : ""}`}
            style={{ opacity: titleVisible ? wordOpacities[0] : 0 }}
          >
            POWER
          </h2>
          <h2
            className={`!font-changeling ${isMobile ? "text-3xl" : ""}`}
            style={{ opacity: titleVisible ? wordOpacities[1] : 0 }}
          >
            YOUR
          </h2>
          <h2
            className={`!font-changeling ${isMobile ? "text-3xl" : ""}`}
            style={{ opacity: titleVisible ? wordOpacities[2] : 0 }}
          >
            DESTINY
          </h2>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-6 inset-x-0 z-30 hidden md:flex justify-center">
        <svg
          className="w-5 h-5 md:w-6 md:h-6 text-nasun-white/50 animate-bounce"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </div>
    </div>
  );
}

export default React.memo(GenesisNftHeroSection);
