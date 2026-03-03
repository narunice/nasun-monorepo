import React, { useState, useEffect, useRef, useCallback } from "react";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { useIsMobile } from "@/hooks/useIsMobile";

const battalionNftVideoDesktop = "/videos/Battalion-Nft-Leeterbox-01-rf25.mp4";
const battalionNftVideoMobile = "/videos/Battalion-Nft-White-Square-01-rf28.mp4";

interface BattalionNftHeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

// Title animation timing constants
const TITLE_START_TIME = 1.1;
const WORD_FADE_DURATION = 0.45;
const TITLE_END_TIME = 4.33;

/**
 * BattalionNftHeroSection 컴포넌트
 *
 * Battalion NFT 페이지의 Hero 섹션 - 배경 동영상과 타이틀
 */
function BattalionNftHeroSection({ onVideoReady }: BattalionNftHeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const isMobile = useIsMobile();
  const [titleVisible, setTitleVisible] = useState(false);
  const [wordOpacities, setWordOpacities] = useState([0, 0, 0]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 비디오 can play 핸들러 - 비디오 준비 완료
  const handleVideoCanPlay = () => {
    setIsVideoLoaded(true);
    onVideoReady?.();
  };

  // 비디오 playing 핸들러 - 비디오 재생 시작
  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
  };

  // Cached video fallback: 컴포넌트 재마운트 시 캐시된 비디오의
  // onCanPlay/onPlaying 이벤트가 발화되지 않는 모바일 브라우저 대응
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // readyState >= HAVE_FUTURE_DATA(3)이면 이미 재생 가능한 상태
    if (video.readyState >= 3) {
      setIsVideoLoaded(true);
      onVideoReady?.();
    }

    // autoPlay 속성이 있어도 모바일에서 재마운트 시 재생 안 되는 경우 대응
    video.play().then(() => {
      setIsVideoPlaying(true);
    }).catch(() => {
      // Autoplay blocked — 5초 timeout fallback이 처리
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Title animation based on video time
  const updateTitleAnimation = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const currentTime = video.currentTime;
    // Use video.duration directly instead of state (handles cached video case)
    const duration = video.duration;

    // "POWER YOUR DESTINY" animation
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

  // Animation loop for title
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

  // Timeout fallback - 5초 후에도 비디오가 로드되지 않으면 강제로 표시
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

  // 스켈레톤 방식: 비디오 로딩 전에만 h-screen으로 공간 확보 (레이아웃 시프트 방지)
  // 비디오 로딩 후에는 비디오 자체 크기로 표시
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
      {/* 비디오 로딩 중 - 로딩 스피너 */}
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
          src={isMobile ? battalionNftVideoMobile : battalionNftVideoDesktop}
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

export default React.memo(BattalionNftHeroSection);
