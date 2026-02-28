import React, { useState, useEffect } from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { InlineLoading } from "../../../ui/InlineLoading";
const nsnNetworkVideo = "/videos/Nsn-Network-Section-rf28.mp4";
const nsnNetworkVideoMobile = "/videos/Nsn-Network-Section-Mobile-rf27.mp4";

interface NetworkHeroSectionProps {
  onVideoReady?: () => void;
  isVideoReady?: boolean;
}

/**
 * NetworkHeroSection 컴포넌트
 *
 * NSN Network 페이지의 Hero 섹션 - 반응형 배경 동영상과 좌측 하단 타이틀
 */
function NetworkHeroSection({ onVideoReady, isVideoReady }: NetworkHeroSectionProps) {
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

  // 로딩 중일 때: 전체 화면 오버레이로 다음 섹션 가림
  // 로딩 완료 후: 정상 섹션으로 전환
  const containerClassName = !isVideoReady
    ? "fixed inset-0 z-40 bg-nasun-black h-screen overflow-hidden flex items-center justify-center"
    : "relative !p-0 -mt-14 md:mt-0";

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
          background: "linear-gradient(to bottom, transparent 66%, rgb(25, 22, 21) 100%)",
        }}
      />

      {/* Hero 타이틀 - 모바일 (md 미만): 인라인, 자연스러운 줄바꿈 */}
      {isVideoPlaying && (
        <div className="absolute inset-x-0 bottom-[15%] z-20 px-6 md:hidden">
          <h3 className="leading-tight text-center">
            <span className="!font-eurostile uppercase text-nasun-c3">Public</span>{" "}
            <span className="!font-eurostile uppercase text-nasun-white">Transparency</span>
            <br />
            <span className="!font-eurostile uppercase text-nasun-c3">Private</span>{" "}
            <span className="!font-eurostile uppercase text-nasun-white">Autonomy</span>
          </h3>
        </div>
      )}

      {/* Hero 타이틀 - 데스크탑 (md 이상): 우측 정렬, xl에서 레이아웃 변경 */}
      {isVideoPlaying && (
        <div className="absolute hidden md:block md:inset-x-auto md:right-[10%] lg:right-[10%] md:bottom-[25%] xl:bottom-[40%] z-20">
          <h3 className="leading-tight text-right">
            <span className="block xl:inline !font-eurostile uppercase text-nasun-c3">Public</span>
            <span className="hidden xl:inline">{"  "}</span>
            <span className="block xl:inline !font-eurostile uppercase text-nasun-white">
              Transparency
            </span>
            <br className="hidden xl:block" />
            <span className="block xl:inline mt-4 xl:mt-0 !font-eurostile uppercase text-nasun-c3">
              Private
            </span>
            <span className="hidden xl:inline">{"  "}</span>
            <span className="block xl:inline !font-eurostile uppercase text-nasun-white">
              Autonomy
            </span>
          </h3>
        </div>
      )}
    </SectionLayout>
  );
}

export default React.memo(NetworkHeroSection);
