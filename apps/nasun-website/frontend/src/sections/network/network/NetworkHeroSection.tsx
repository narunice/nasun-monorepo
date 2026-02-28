import React, { useState, useEffect } from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { InlineLoading } from "@/components/ui/InlineLoading";
const nsnNetworkVideo = "/videos/Nsn-Network-Section-rf28.mp4";
const nsnNetworkVideoMobile = "/videos/Nsn-Network-Section-Mobile-rf27.mp4";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { ArrowUpRight } from "lucide-react";

interface NetworkHeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

/**
 * NetworkHeroSection 컴포넌트
 *
 * NSN Network 페이지의 Hero 섹션 - 반응형 배경 동영상과 좌측 하단 타이틀
 */
function NetworkHeroSection({ onVideoReady }: NetworkHeroSectionProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

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
  const containerClassName = `relative !p-0 mt-0 md:mt-0 bg-nasun-black ${!isVideoPlaying ? "h-screen" : ""}`;

  return (
    <SectionLayout className={containerClassName}>
      {/* 비디오 로딩 중 - 로딩 스피너 */}
      {!isVideoPlaying && (
        <div className="absolute inset-0 bg-nasun-black flex items-center justify-center z-20">
          <InlineLoading message="Loading..." size="lg" />
        </div>
      )}

      {/* 배경 동영상 - 반응형 (모바일/데스크탑) */}
      <video
        key={isMobile ? "mobile" : "desktop"}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster={isMobile ? "/images/posters/Nsn-Network-Section-Mobile-rf27.webp" : "/images/posters/Nsn-Network-Section-rf28.webp"}
        onCanPlay={handleVideoCanPlay}
        onPlaying={handleVideoPlaying}
        className={`w-full h-full ${
          !isVideoPlaying ? "opacity-0" : "opacity-100"
        } transition-opacity duration-500`}
        style={{
          objectFit: isMobile ? "cover" : "contain",
          objectPosition: isMobile ? "center center" : "center center",
        }}
      >
        <source src={isMobile ? nsnNetworkVideoMobile : nsnNetworkVideo} type="video/mp4" />
      </video>

      {/* Gradient Overlay - 상단 2/3 투명, 하단 1/3 nasun-black */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: "linear-gradient(to bottom, transparent 66%, #191615 100%)",
        }}
      />

      {/* Hero 타이틀 - 모바일 (md 미만): 인라인, 자연스러운 줄바꿈 + 버튼 중앙 정렬 */}
      {isVideoPlaying && (
        <div className="absolute inset-x-0 bottom-[2%] sm:bottom-[10%] z-20 px-6 md:hidden">
          <div className="leading-tight text-center">
            <h3 className="font-medium text-nasun-white text-3xl sm:text-[34px] uppercase ">
              ONE NETWORK
            </h3>
            <h4 className=" text-nasun-white/60 text-lg  sm:text-xl">
              One Unified Economy
            </h4>
          </div>
          <div className="flex justify-center mt-3">
            <Button variant="white" size="lg" asChild className="mt-5">
              <Link
                to={import.meta.env.VITE_DEVNET_EXPLORER_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Devnet & Wallet
                <ArrowUpRight className="ml-1.5 size-4 shrink-0" />
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Hero 타이틀 - 데스크탑 (md 이상): 우측 정렬, xl에서 레이아웃 변경 */}
      {isVideoPlaying && (
        <div className="absolute hidden md:flex md:flex-col md:inset-x-auto md:right-[10%] md:bottom-[25%]  lg:right-[10%] xl:right-[17%] xl:bottom-[25%] z-20 text-end">
          <div>
            <FadeInUp>
              <h3 className="font-medium text-nasun-white text-2xl/tight md:text-[32px] lg:text-[39px] uppercase">
                ONE NETWORK
              </h3>
              <h5 className="text-nasun-white/70 text-2xl/tight md:text-[22px] lg:text-[27px]">
                One Unified Economy
              </h5>
              <Button variant="white" size="lg" asChild className="mt-5">
                <Link
                  to={import.meta.env.VITE_DEVNET_EXPLORER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Devnet & Wallet
                  <ArrowUpRight className="ml-1.5 size-4 shrink-0" />
                </Link>
              </Button>
            </FadeInUp>
          </div>
        </div>
      )}
    </SectionLayout>
  );
}

export default NetworkHeroSection;
