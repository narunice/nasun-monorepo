import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import fullTrailerVideoMP4 from "../../../assets/videos/Full-Trailer184s-rf29.mp4";
import { InlineLoading } from "../../ui";

interface HeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

const WORDS = ["GAMES", "FILMS", "FINANCE", "EXECUTION"];

function HeroSectionV2({ onVideoReady }: HeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [areImagesReady, setAreImagesReady] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

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
    // 타임아웃으로 최대 대기 시간 설정 (5초)
    const timeout = setTimeout(() => {
      if (!isVideoLoaded) {
        setIsVideoLoaded(true);
        setIsVideoPlaying(true);
        onVideoReady?.();
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [isVideoLoaded, onVideoReady]);

  // 텍스트 애니메이션 타이머
  useEffect(() => {
    // 0.7s (Exit) + 0.3s (Gap) + 0.5s (Enter) + 1.6s (Stay) = 3.1s Cycle
    const interval = setInterval(() => {
      setCurrentWordIndex((prev) => (prev + 1) % WORDS.length);
    }, 3100);

    return () => clearInterval(interval);
  }, []);

  // V2는 지정된 단일 트레일러 비디오 사용
  const videoSrc = fullTrailerVideoMP4;

  // 스켈레톤 방식: h-screen 공간 항상 확보 (레이아웃 시프트 방지)
  return (
    <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] h-screen overflow-hidden flex items-center justify-center bg-nasun-black">
      {/* 비디오 - opacity 전환으로 페이드인 */}
      <video
        key={videoSrc}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className={`w-full max-w-none h-full object-cover transition-opacity duration-500 ${
          isVideoPlaying ? "opacity-100" : "opacity-0"
        }`}
        onCanPlay={handleVideoCanPlay}
        onPlaying={handleVideoPlaying}
      >
        <source src={videoSrc} type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* 텍스트 오버레이 애니메이션 */}
      {isVideoPlaying && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-[18vh] z-30 pointer-events-none">
          <AnimatePresence mode="wait">
            <motion.h1
              key={currentWordIndex}
              initial={{ scale: 15, opacity: 0, filter: "blur(5px)" }}
              animate={{
                scale: 1,
                opacity: 1,
                filter: "blur(0px)",
                transition: { duration: 0.5, ease: "circOut", delay: 0.3 },
              }}
              exit={{
                scale: 0,
                opacity: 0,
                filter: "blur(5px)",
                transition: { duration: 0.7, ease: "circIn" },
              }}
              className="text-nasun-white !font-changeling text-4xl md:text-6xl lg:text-8xl tracking-widest text-center uppercase drop-shadow-lg"
            >
              {WORDS[currentWordIndex]}
            </motion.h1>
          </AnimatePresence>
        </div>
      )}

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
        </div>
      )}
    </div>
  );
}

export default React.memo(HeroSectionV2);
