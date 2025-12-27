import React, { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import visionVideoPcMP4 from "../../../assets/videos/home-vision-wave-light-desktop.mp4";
import visionVideoMobileMP4 from "../../../assets/videos/home-vision-wave-light-mobile.mp4";
import triangleIcon from "../../../assets/images/home-vision-triangle.png";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TextSubtitle, TextDescription } from "@/components/ui/TextBox";

/**
 * VisionSection 컴포넌트
 *
 * Nasun의 비전을 설명하는 섹션으로 2열 레이아웃을 사용합니다:
 * - 좌측: 역삼각형 아이콘
 * - 우측: VISION 텍스트 (타이틀, 소제목, 본문)
 * - 배경: 무한 루프 비디오
 */
function VisionSection() {
  const { t } = useTranslation("home");
  const [isMobile, setIsMobile] = useState(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 모바일 디바이스 감지 (1024px 미만)
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

  // 디바이스에 따라 비디오 소스 선택 (항상 라이트 모드)
  const videoSrc = isMobile ? visionVideoMobileMP4 : visionVideoPcMP4;

  // 비디오 로드 완료 시 재생 (iOS 대응)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      // iOS에서 비디오 메타데이터 로드 완료 시 즉시 재생 시도
      video.play().catch(() => {
        // 자동 재생 실패 시 무시 (사용자 상호작용 필요)
      });
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    // 이미 로드되었을 경우 즉시 재생
    if (video.readyState >= 1) {
      video.play().catch(() => {});
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, []);

  // IntersectionObserver - 화면 진입 시 재생, 이탈 시 멈춤
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = videoRef.current;

          if (entry.isIntersecting) {
            // 화면에 보일 때 재생
            video?.play().catch(() => {
              // 자동 재생 실패 시 무시
            });
          } else {
            // 화면 밖일 때 멈춤
            video?.pause();
          }
        });
      },
      { threshold: 0.1 } // 10% 이상 보이면 재생
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <SectionLayout className="relative min-h-screen">
      {/* 배경 비디오 컨테이너 - 브라우저 전체 너비 */}
      <div ref={containerRef} className="absolute top-0 left-1/2 -translate-x-1/2 w-screen h-full">
        {/* 배경 비디오 */}
        <video
          key={videoSrc}
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          webkit-playsinline="true"
          preload="metadata"
          x-webkit-airplay="allow"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
          }}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
      </div>

      {/* 컨텐츠 */}
      <div className="max-w-7xl mx-auto ">
        <div className="grid grid-cols-1 lg:grid-cols-[40%_60%] gap-8 lg:gap-0 relative z-30">
          {/* 좌측: 역삼각형 아이콘 */}
          <div className="flex flex-col items-center justify-center">
            <div className="w-56 h-56 lg:w-64 lg:h-64 xl:w-72 xl:h-72 flex items-center justify-center">
              <img
                src={triangleIcon}
                alt="Vision Triangle"
                className="w-full h-full object-contain"
              />
            </div>
          </div>

          {/* 우측: VISION 텍스트 박스 */}
          <div className="flex flex-col items-center justify-center max-w-[410px] md:max-w-[460px] lg:max-w-[490px] mx-auto px-4 lg:px-0 ">
            {/* VISION 타이틀 */}
            <SectionTitle
              as="h2"
              color="scarlet"
              className="text-center lg:text-right self-center lg:self-end !font-eurostile"
            >
              {t("vision.title")}
            </SectionTitle>

            {/* 소제목 */}
            <TextSubtitle className="!text-nasun-black/80 !text-lg lg:!text-xl xl:!text-2xl !font-semibold text-center lg:!text-left w-full mt-5 lg:mt-0">
              {t("vision.subtitle")}
            </TextSubtitle>

            {/* 본문: 글로벌 CSS p 스타일 활용 (크기, 폰트, 줄간격), 색상만 커스텀 */}
            <TextDescription as="p" className="text-nasun-black/80 text-center lg:!text-left">
              {t("vision.description")}
            </TextDescription>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(VisionSection);
