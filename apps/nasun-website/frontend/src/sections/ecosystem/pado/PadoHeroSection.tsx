import React, { useState, useEffect } from "react";

import { InlineLoading } from "@/components/ui/InlineLoading";
const waldenVideoDesktop = "/videos/walden-hero-token-desktop.mp4";
const waldenVideoMobile = "/videos/Walden-Dex-Token-Mobile-rf18.mp4";
import { Button } from "@/components/ui";
import { ExternalLink } from "lucide-react";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { useTranslation } from "react-i18next";

interface PadoHeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
  translationNs?: string;
}

/**
 * PadoHeroSection 컴포넌트
 *
 * Pado 페이지의 Hero 섹션 - 반응형 배경 동영상과 텍스트+아이콘
 */
function PadoHeroSection({ onVideoReady, translationNs = "pado" }: PadoHeroSectionProps) {
  // Dynamic namespace — strict key typing not applicable
  const { t } = useTranslation(translationNs as "pado") as {
    t: (key: string, options?: Record<string, unknown>) => string;
  };
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Resize observer - 모바일/데스크탑 동영상 전환
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint
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
  // onPlaying이 발생하면 비디오가 재생 가능한 상태이므로 isVideoReady도 true로 설정
  const handleVideoPlaying = () => {
    setIsVideoPlaying(true);
    if (!isVideoLoaded) {
      setIsVideoLoaded(true);
      onVideoReady?.();
    }
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

  // 스켈레톤 방식: 비디오 로딩 전에만 h-screen으로 공간 확보 (레이아웃 시프트 방지)
  // 비디오 로딩 후에는 비디오 자체 크기로 표시
  const containerClassName = `relative !p-0 -mt-14 lg:mt-0 mx-auto flex items-center justify-center bg-nasun-black ${!isVideoPlaying ? "h-screen" : ""}`;

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
            /* Mobile: Bottom Center (< 1024px) */
            bottom-[15%] sm:bottom-[30%] left-0 right-0
            /* Desktop: Right Center (>= 1024px) */
            lg:bottom-[15%] xl:bottom-[20%] 2xl:bottom-[25%] lg:pl-[38%] xl:pl-[41%] lg:-translate-y-1/2
            /* Alignment */
            flex flex-col items-center
            text-center
            px-4
            pointer-events-auto"
          >
            <FadeInUp>
              <h3 className="2xl:!text-5xl mb-2">{t("hero.title")}</h3>
              {(t("hero.subtitleLine1") || t("hero.subtitle")) && (
                <h5 className="xl:text-3xl  text-nasun-white/70">
                  {t("hero.subtitleLine1", { defaultValue: "" }) ? (
                    <>
                      {t("hero.subtitleLine1")}
                      <br />
                      {t("hero.subtitleLine2")}
                    </>
                  ) : (
                    t("hero.subtitle")
                  )}
                </h5>
              )}
              <Button variant="white" size="lg" asChild className="mt-6">
                <a
                  href={import.meta.env.VITE_PADO_ALPHA_URL || "https://staging.pado.finance"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("hero.cta")}
                  <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </Button>
            </FadeInUp>
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(PadoHeroSection);
