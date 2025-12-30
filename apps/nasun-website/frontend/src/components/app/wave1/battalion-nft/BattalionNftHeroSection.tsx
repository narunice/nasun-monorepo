import React, { useState, useEffect } from "react";
import { InlineLoading } from "../../../ui/InlineLoading";
import battalionNftVideoDesktop from "../../../../assets/videos/Battalion-Nft-Leeterbox-01-rf22.mp4";
import battalionNftVideoMobile from "../../../../assets/videos/Battalion-Nft-White-Square-01-mobile-rf20.mp4";

interface BattalionNftHeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

/**
 * BattalionNftHeroSection 컴포넌트
 *
 * Battalion NFT 페이지의 Hero 섹션 - 배경 동영상과 타이틀
 */
function BattalionNftHeroSection({ onVideoReady, isVideoReady }: BattalionNftHeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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

  // 스켈레톤 방식: 항상 공간 확보 (레이아웃 시프트 방지)
  // 모바일: 동영상 크기에 맞춤, 데스크탑: 뷰포트 높이
  const containerClassName = isMobile
    ? "relative bg-nasun-black" // 모바일: 동영상 크기에 맞춤
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
        /* 모바일: Wrapper 사용 (비디오 크기에 맞춤) */
        <div className="relative">
          <video
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
        </div>
      ) : (
        /* 데스크탑: Wrapper 없이 직접 렌더링 (컨테이너 전체 커버) */
        <>
          <video
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
        </>
      )}
    </div>
  );
}

export default React.memo(BattalionNftHeroSection);
