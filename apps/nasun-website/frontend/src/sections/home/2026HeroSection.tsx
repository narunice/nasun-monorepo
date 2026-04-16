import { useState, useEffect } from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { ButtonV3 } from "@/components/ui/button-v3";
import { FadeInUp } from "@/components/ui/FadeInUp";

/**
 * 2026HeroSection 컴포넌트
 *
 * 2026년 디자인 가이드를 따르는 새로운 히어로 섹션
 * 비디오 배경 위 중앙 정렬된 타이틀과 태그라인, 버튼을 포함합니다.
 */
function Hero2026Section() {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // 비디오 파일 경로
  const bgVideo = "/videos/Canyons-uju-bg.mp4";

  // 비디오 can play 핸들러
  const handleVideoCanPlay = () => {
    setIsVideoLoaded(true);
  };

  // 비디오 playing 핸들러
  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
    if (!isVideoLoaded) setIsVideoLoaded(true);
  };

  // Timeout fallback
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isVideoLoaded) {
        setIsVideoLoaded(true);
        setIsVideoPlaying(true);
      }
    }, 5000);
    return () => clearTimeout(timeout);
  }, [isVideoLoaded]);

  // 컨테이너 스타일: 수직 정렬을 하단(justify-end)으로 변경
  const containerClassName =
    "relative !p-0 mt-0 overflow-hidden min-h-screen flex items-center !justify-end";

  return (
    <SectionLayout className={containerClassName}>
      {/* 비디오 로딩 중 - 로딩 스피너 */}
      {!isVideoPlaying && (
        <div className="absolute inset-0 bg-nasun-black flex items-center justify-center z-20">
          <InlineLoading message="Loading..." size="lg" />
        </div>
      )}

      {/* 배경 동영상 */}
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onCanPlay={handleVideoCanPlay}
        onPlaying={handleVideoPlaying}
        className={`absolute inset-0 w-full h-full object-cover ${
          !isVideoPlaying ? "opacity-0" : "opacity-100"
        } transition-opacity duration-1000 z-0`}
      >
        <source src={bgVideo} type="video/mp4" />
      </video>

      {/* Overlay - 상단 투명, 하단 40%부터 서서히 어두워짐 */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, transparent 65%, rgba(0, 0, 0, 0.55) 100%)",
        }}
      />

      {/* 컨텐츠 - 중앙 정렬 */}
      {isVideoPlaying && (
        <div className="relative z-20 w-full px-6 flex flex-col text-center py-[8%] ">
          <FadeInUp>
            <div className="flex flex-col items-center">
              <h1 className="text-white !font-changeling font-bold tracking-widest uppercase mb-2">
                NASUN
              </h1>

              <h3 className="text-nasun-white/90 font-medium mb-2">
                Grow the Life You Own
              </h3>

              <div className=" my-4 md:my-5 lg:my-6 space-y-2">
                <p className="text-nasun-white/70 text-lg md:text-xl">
                  uju (우주) means universe. Your Universe.
                </p>
                <p className="text-nasun-white/70 text-lg md:text-xl">
                  One identity. Every app. Everything you do compounds.
                </p>
              </div>

              <ButtonV3
                size="lg"
                className="min-w-[200px] mt-4 md:mt-6 lg:mt-8"
              >
                Enter uju
              </ButtonV3>
            </div>
          </FadeInUp>

          {/* Scroll indicator */}
          <div className="absolute bottom-6 inset-x-0 z-20 flex justify-center">
            <svg
              className="w-6 h-6 text-nasun-white/50 animate-bounce"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          </div>
        </div>
      )}
    </SectionLayout>
  );
}

export default Hero2026Section;
