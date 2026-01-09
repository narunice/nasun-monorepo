import React, { useState, useEffect, useRef, useCallback } from "react";
import { InlineLoading } from "../../../ui/InlineLoading";
import battalionNftVideoDesktop from "../../../../assets/videos/Battalion-Nft-Leeterbox-01-rf22.mp4";
import battalionNftVideoMobile from "../../../../assets/videos/Battalion-Nft-White-Square-01-mobile-rf20.mp4";

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
function BattalionNftHeroSection({ onVideoReady, isVideoReady }: BattalionNftHeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [titleVisible, setTitleVisible] = useState(false);
  const [wordOpacities, setWordOpacities] = useState([0, 0, 0]); // POWER, YOUR, DESTINY
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

    // Hide title after TITLE_END_TIME (cut out)
    if (currentTime >= TITLE_END_TIME) {
      setTitleVisible(false);
      setWordOpacities([0, 0, 0]);
      return;
    }

    // Before title starts
    if (currentTime < TITLE_START_TIME) {
      setTitleVisible(false);
      setWordOpacities([0, 0, 0]);
      return;
    }

    // Title is visible during animation window
    setTitleVisible(true);

    // Calculate opacity for each word
    const newOpacities = [0, 1, 2].map((index) => {
      const wordStartTime = TITLE_START_TIME + index * WORD_FADE_DURATION;
      const wordEndTime = wordStartTime + WORD_FADE_DURATION;

      if (currentTime < wordStartTime) return 0;
      if (currentTime >= wordEndTime) return 1;

      // Linear fade in
      return (currentTime - wordStartTime) / WORD_FADE_DURATION;
    });

    setWordOpacities(newOpacities);
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

  // Timeout fallback - 10초 후에도 비디오가 로드되지 않으면 강제로 표시
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isVideoLoaded) {
        setIsVideoLoaded(true);
        setIsVideoPlaying(true);
        onVideoReady?.();
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [isVideoLoaded, onVideoReady]);

  // 로딩 중: 전체 화면 오버레이
  // 로딩 완료 후: 모바일/데스크탑 분기
  const containerClassName = !isVideoReady
    ? "fixed inset-0 z-40 bg-nasun-black h-screen overflow-hidden flex items-center justify-center"
    : isMobile
    ? "relative" // 모바일: 동영상 크기에 맞춤
    : "relative flex items-start justify-center h-screen overflow-hidden"; // 데스크탑: 뷰포트 높이, 상단 정렬

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
        /* 모바일: Wrapper 사용 (비디오 크기에 맞춤) */
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

          {/* Gradient Overlay */}
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: "linear-gradient(to bottom, transparent 66%, rgb(25, 22, 21) 100%)",
            }}
          />

          {/* Title Overlay */}
          <div className="absolute bottom-[15%] left-0 right-0 flex justify-center items-baseline gap-3 z-30 font-changeling text-3xl md:text-4xl tracking-wider text-white">
            <span style={{ opacity: titleVisible ? wordOpacities[0] : 0 }}>POWER</span>
            <span style={{ opacity: titleVisible ? wordOpacities[1] : 0 }}>YOUR</span>
            <span style={{ opacity: titleVisible ? wordOpacities[2] : 0 }}>DESTINY</span>
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
          <div className="absolute bottom-[15%] left-0 right-0 flex justify-center items-baseline gap-4 z-30 font-changeling text-4xl md:text-5xl lg:text-6xl tracking-wider text-white">
            <span style={{ opacity: titleVisible ? wordOpacities[0] : 0 }}>POWER</span>
            <span style={{ opacity: titleVisible ? wordOpacities[1] : 0 }}>YOUR</span>
            <span style={{ opacity: titleVisible ? wordOpacities[2] : 0 }}>DESTINY</span>
          </div>
        </>
      )}
    </div>
  );
}

export default React.memo(BattalionNftHeroSection);
