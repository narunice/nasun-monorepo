import React, { useState, useEffect } from "react";
import heroVideoPcMP4 from "../../../assets/videos/home-hero-crf29.mp4";
import heroVideoMobileMP4 from "../../../assets/videos/home-hero-mobile-crf29.mp4";
import { InlineLoading } from "../../ui";

interface HeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

function HeroSection({ onVideoReady, isVideoReady = false }: HeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [areImagesReady, setAreImagesReady] = useState(false);

  // 로고 이미지 프리로드 (동시 로딩 보장)
  useEffect(() => {
    const symbolImg = new Image();
    const wordmarkImg = new Image();
    let symbolLoaded = false;
    let wordmarkLoaded = false;

    const checkBothLoaded = () => {
      if (symbolLoaded && wordmarkLoaded) {
        setAreImagesReady(true);
      }
    };

    symbolImg.onload = () => {
      symbolLoaded = true;
      checkBothLoaded();
    };

    wordmarkImg.onload = () => {
      wordmarkLoaded = true;
      checkBothLoaded();
    };

    symbolImg.src = "/nasun_symbol_white.svg";
    wordmarkImg.src = "/NASUN_wordmark-white.png";
  }, []);

  // 모바일 디바이스 감지 (768px 미만)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    // 초기 체크
    checkMobile();

    // 리사이즈 이벤트 리스너
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // 비디오가 재생 가능할 때 (충분히 버퍼링됨)
  const handleVideoCanPlay = () => {
    setIsVideoLoaded(true);
    onVideoReady?.();
  };

  // 비디오가 실제로 재생 시작될 때
  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
  };

  useEffect(() => {
    // 타임아웃으로 최대 대기 시간 설정 (10초)
    const timeout = setTimeout(() => {
      if (!isVideoLoaded) {
        setIsVideoLoaded(true);
        setIsVideoPlaying(true);
        onVideoReady?.();
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [isVideoLoaded, onVideoReady]);

  // 디바이스에 따라 비디오 소스 선택
  const videoSrc = isMobile ? heroVideoMobileMP4 : heroVideoPcMP4;
  const posterSrc = isMobile ? "/hero-poster-mobile.jpg" : "/hero-poster-desktop.jpg";

  // CSS 기반 위치 제어: 비디오 로딩 중에는 fixed, 완료 후에는 relative
  const containerClassName = !isVideoReady
    ? "fixed inset-0 z-40 bg-nasun-black h-screen overflow-hidden flex items-center justify-center"
    : "w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] h-screen overflow-hidden flex items-center justify-center";

  return (
    <div className={containerClassName}>
      <video
        key={videoSrc}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster={posterSrc}
        className="w-full max-w-none h-full object-cover"
        onCanPlay={handleVideoCanPlay}
        onPlaying={handleVideoPlaying}
      >
        <source src={videoSrc} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* 로딩 오버레이 - 비디오 재생 전까지 표시 */}
      {!isVideoPlaying && (
        <div className="absolute inset-0 bg-nasun-black flex items-center justify-center z-20">
          <InlineLoading message="Loading..." size="lg" />
        </div>
      )}

      {/* NASUN 로고 오버레이 - 비디오 재생 + 이미지 로드 완료 후에만 표시 */}
      {isVideoPlaying && areImagesReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 md:gap-10 z-10 pt-14">
          <img
            src="/nasun_symbol_white.svg"
            alt="NASUN Symbol"
            className="w-32 md:w-36 lg:w-44 xl:w-48"
          />
          <img
            src="/NASUN_wordmark-white.png"
            alt="NASUN Wordmark"
            className="w-64 md:w-72 lg:w-[340px] xl:w-[380px]"
          />
        </div>
      )}
    </div>
  );
}

export default React.memo(HeroSection);
