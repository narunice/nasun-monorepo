import React, { useState, useEffect, useRef, useCallback } from "react";
import { InlineLoading } from "@/components/ui/InlineLoading";
import battalionNftVideoDesktop from "../../../assets/videos/Battalion-Nft-Letterbox-01-rf22.mp4";
import battalionNftVideoMobile from "../../../assets/videos/Battalion-Nft-White-Square-01-mobile-rf20.mp4";

interface BattalionNftHeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

// Title animation timing constants
const TITLE_START_TIME = 1.1;
const WORD_FADE_DURATION = 0.45;
const TITLE_END_TIME = 4.33;

// Wave title animation timing
const WAVE_TITLE_START_TIME = 15.7;
const WAVE_TITLE_FADE_DURATION = 0.5;

/**
 * BattalionNftHeroSection 컴포넌트
 *
 * Battalion NFT 페이지의 Hero 섹션 - 배경 동영상과 타이틀
 */
function BattalionNftHeroSection({ onVideoReady }: BattalionNftHeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const [titleVisible, setTitleVisible] = useState(false);
  const [wordOpacities, setWordOpacities] = useState([0, 0, 0]);
  const [waveTitleOpacity, setWaveTitleOpacity] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 모바일 뷰포트 감지 (1024px 미만)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    // 초기 체크
    checkMobile();

    // 리사이즈 이벤트 리스너
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 비디오 can play 핸들러 - 비디오 준비 완료
  const handleVideoCanPlay = () => {
    setIsVideoLoaded(true);
    onVideoReady?.();
  };

  // 비디오 playing 핸들러 - 비디오 재생 시작
  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
  };

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

    // "BATTALION" animation
    if (
      duration > 0 &&
      !isNaN(duration) &&
      currentTime >= WAVE_TITLE_START_TIME &&
      currentTime < duration - 0.05
    ) {
      const fadeProgress = Math.min(
        1,
        (currentTime - WAVE_TITLE_START_TIME) / WAVE_TITLE_FADE_DURATION
      );
      setWaveTitleOpacity(fadeProgress);
    } else {
      setWaveTitleOpacity(0);
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
    }, 8000);

    return () => clearTimeout(timeout);
  }, [isVideoLoaded, onVideoReady]);

  // 스켈레톤 방식: 비디오 로딩 전에만 h-screen으로 공간 확보 (레이아웃 시프트 방지)
  // 비디오 로딩 후에는 비디오 자체 크기로 표시
  const containerClassName = isMobile
    ? `relative bg-nasun-black ${!isVideoPlaying ? "h-screen" : ""}` // 모바일: 로딩 전 h-screen, 로딩 후 동영상 크기
    : "relative flex items-start justify-center h-screen overflow-hidden bg-nasun-black"; // 데스크탑: 뷰포트 높이, 상단 정렬

  // 비디오 클래스: 모바일/데스크탑 완전 분리
  const videoClassName = isMobile
    ? ` w-full object-contain ${
        !isVideoPlaying ? "opacity-0" : "opacity-100"
      } transition-opacity duration-500`
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

      {isMobile ? (
        /* 모바일: 비디오 + 타이틀 스택 레이아웃 */
        <div className="flex flex-col pt-16">
          {/* Video Container */}
          <div className="relative">
            <video
              ref={videoRef}
              key="mobile"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onCanPlay={handleVideoCanPlay}
              onPlaying={handleVideoPlaying}
              className={videoClassName}
            >
              <source src={battalionNftVideoMobile} type="video/mp4" />
            </video>

            {/* Top Gradient Overlay */}
            <div
              className="absolute inset-x-0 top-0 h-24 pointer-events-none z-10"
              style={{
                background: "linear-gradient(to bottom, rgb(25, 22, 21) 0%, transparent 100%)",
              }}
            />

            {/* Bottom Gradient Overlay */}
            <div
              className="absolute inset-x-0 bottom-0 h-32 pointer-events-none z-10"
              style={{
                background: "linear-gradient(to top, rgb(25, 22, 21) 0%, transparent 100%)",
              }}
            />
          </div>

          {/* Title Section - Below Video */}
          <div className="relative z-20 flex flex-col items-center text-center px-4 -mt-12">
            <div className="relative flex flex-col items-center">
              {/* POWER YOUR DESTINY */}
              <div className="flex flex-col items-center">
                <h2
                  className="!font-changeling text-3xl"
                  style={{ opacity: titleVisible ? wordOpacities[0] : 0 }}
                >
                  POWER
                </h2>
                <h2
                  className="!font-changeling text-3xl"
                  style={{ opacity: titleVisible ? wordOpacities[1] : 0 }}
                >
                  YOUR
                </h2>
                <h2
                  className="!font-changeling text-3xl"
                  style={{ opacity: titleVisible ? wordOpacities[2] : 0 }}
                >
                  DESTINY
                </h2>
              </div>
              {/* BATTALION */}
              <h2
                className="absolute inset-0 flex items-center justify-center !font-changeling text-3xl"
                style={{ opacity: waveTitleOpacity }}
              >
                BATTALION
              </h2>
            </div>
          </div>
        </div>
      ) : (
        /* 데스크탑: Wrapper 없이 직접 렌더링 (컨테이너 전체 커버) */
        <>
          <video
            ref={videoRef}
            key="desktop"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            onCanPlay={handleVideoCanPlay}
            onPlaying={handleVideoPlaying}
            className={videoClassName}
          >
            <source src={battalionNftVideoDesktop} type="video/mp4" />
          </video>

          {/* Gradient Overlay */}
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: "linear-gradient(to bottom, transparent 66%, rgb(25, 22, 21) 100%)",
            }}
          />

          {/* Title Overlay */}
          <div className="absolute bottom-[23%] left-0 right-0 z-30">
            {/* POWER YOUR DESTINY */}
            <div className="flex justify-center items-baseline gap-4">
              <h2
                className="!font-changeling"
                style={{ opacity: titleVisible ? wordOpacities[0] : 0 }}
              >
                POWER
              </h2>
              <h2
                className="!font-changeling"
                style={{ opacity: titleVisible ? wordOpacities[1] : 0 }}
              >
                YOUR
              </h2>
              <h2
                className="!font-changeling"
                style={{ opacity: titleVisible ? wordOpacities[2] : 0 }}
              >
                DESTINY
              </h2>
            </div>
            {/* BATTALION */}
            <div className="absolute inset-0 flex justify-center items-baseline pt-6">
              <h2 className="!font-changeling" style={{ opacity: waveTitleOpacity }}>
                BATTALION
              </h2>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default React.memo(BattalionNftHeroSection);
