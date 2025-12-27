import React, { useState, useEffect } from "react";

import { InlineLoading } from "../../../ui/InlineLoading";
import waldenVideoDesktop from "../../../../assets/videos/walden-hero-token-desktop.mp4";
import waldenVideoMobile from "../../../../assets/videos/Walden-Dex-Token-Mobile-rf18.mp4";
import waldenPosterDesktop from "../../../../assets/images/walden-hero-poster-desktop.jpg";
import waldenPosterMobile from "../../../../assets/images/walden-hero-poster-mobile.jpg";

interface PadoHeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

/**
 * PadoHeroSection 컴포넌트
 *
 * Pado 페이지의 Hero 섹션 - 반응형 배경 동영상과 텍스트+아이콘
 */
function PadoHeroSection({ onVideoReady, isVideoReady }: PadoHeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Resize observer - 모바일/데스크탑 동영상 전환
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };

    handleResize(); // 초기 설정
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // 비디오 소스 변경 시 로딩 상태 리셋
  useEffect(() => {
    setIsVideoLoaded(false);
    setIsVideoPlaying(false);
  }, [isMobile]);

  // 비디오 can play 핸들러 - 비디오 준비 완료
  const handleVideoCanPlay = () => {
    setIsVideoLoaded(true);
    onVideoReady?.();
  };

  // 비디오 playing 핸들러 - 비디오 재생 시작
  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
  };

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

  // 로딩 중: 전체 화면 오버레이 (모든 것을 가림)
  // 로딩 완료 후: 정상 섹션으로 전환
  const containerClassName = !isVideoReady
    ? "fixed inset-0 z-40 bg-nasun-black h-full  overflow-hidden flex items-center justify-center"
    : "relative !p-0 -mt-14 md:mt-0 mx-auto flex items-center justify-center";

  return (
    <div className={containerClassName}>
      {/* 비디오 로딩 중 - 로딩 스피너 */}
      {!isVideoPlaying && (
        <div className="absolute inset-0 bg-nasun-black flex items-center justify-center z-20">
          <InlineLoading message="Loading..." size="lg" />
        </div>
      )}

      {/* 배경 동영상 - 반응형 (모바일/데스크탑) */}
      <video
        key={isMobile ? "mobile" : "desktop"}
        preload="auto"
        poster={isMobile ? waldenPosterMobile : waldenPosterDesktop}
        autoPlay
        loop
        muted
        playsInline
        onCanPlay={handleVideoCanPlay}
        onPlaying={handleVideoPlaying}
        className={`w-full h-full max-w-9xl ${!isVideoPlaying ? "opacity-0" : "opacity-100"} ${
          isMobile ? "-mt-2 sm:-mt-24" : ""
        } transition-opacity duration-500`}
        style={{
          objectFit: isMobile ? "cover" : "contain",
          objectPosition: isMobile ? "center center" : "center center",
        }}
      >
        <source src={isMobile ? waldenVideoMobile : waldenVideoDesktop} type="video/mp4" />
      </video>

      {/* Gradient Overlay - 상단 2/3 투명, 하단 1/3 nasun-black */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: "linear-gradient(to bottom, transparent 66%, rgb(25, 22, 21) 100%)",
        }}
      />

      {/* 컨텐츠 - 모바일: 섹션 하단, 데스크탑: 화면 우측 배치 */}
      {/* max-w-9xl로 비디오와 동일한 너비 제약을 적용하여 텍스트가 비디오 영역 내에 유지되도록 함 */}
      {isVideoPlaying && (
        <div className="absolute inset-0 max-w-9xl mx-auto pointer-events-none">
          <div
            className="absolute 
            /* Mobile: Bottom Center */
            bottom-[15%] sm:bottom-[30%] left-0 right-0 
            /* Desktop: Right Center */
            md:bottom-[30%] md:left-auto md:right-[5%] lg:right-[10%] xl:right-[15%] md:-translate-y-1/2
            /* Alignment */
            flex flex-col items-center 
            text-center
            px-4
            pointer-events-auto"
          >
            <h3 className="!font-eurostile uppercase text-[34px] xl:text-[40px]">The Next Wave</h3>
            <h4 className="!font-eurostile text-nasun-white/70 text-[27px] xl:text-[32px]">
              in Financial Autonomy
            </h4>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(PadoHeroSection);
