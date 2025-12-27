import React, { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import wave1VideoPcMP4 from "../../../assets/videos/home-wave1-wave-light-desktop.mp4";
import wave1VideoMobileMP4 from "../../../assets/videos/home-wave1-wave-light-mobile.mp4";
import leaderboardDark from "../../../assets/images/home-leaderboard-light.jpg";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ActionLink } from "../../ui/ActionLink";
import { Tag } from "@/components/ui/tag";

/**
 * Wave1Section 컴포넌트
 *
 * WAVE 1 섹션 - 커뮤니티 참여 프로그램 소개
 * - 좌측: 3개 텍스트 박스 (Leaderboard, Battalion NFT, Early Contributor)
 * - 우측: WAVE 1 타이틀 + 리더보드 이미지
 * - 배경: 무한 루프 비디오 (모바일/데스크톱 분기)
 */
function Wave1Section() {
  const { t } = useTranslation("home");
  const [isMobile, setIsMobile] = useState(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  // 디바이스에 따라 비디오 소스 선택 (항상 밝은 배경 사용)
  const videoSrc = isMobile ? wave1VideoMobileMP4 : wave1VideoPcMP4;

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
    <SectionLayout className="max-w-none relative min-h-screen">
      {/* 배경 비디오 컨테이너 */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full">
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
            filter: "sepia(0.15) saturate(0.7) brightness(1)",
          }}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
        {/* 타원형 gradient overlay - 중앙 투명, 바깥쪽 50% 검정 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 0%, transparent 60%, rgba(0,0,0,0.4) 100%)",
          }}
        />
      </div>

      {/* 컨텐츠 */}
      <div className="relative max-w-8xl mx-auto z-20 h-full">
        {/* WAVE 1 타이틀 */}
        <SectionTitle
          as="h2"
          color="scarlet"
          className="!font-eurostile text-center mt-6 mb-2 sm:my-4 md:my-6 lg:mt-8  xl:mt-10"
        >
          {t("wave1.title")}
        </SectionTitle>

        {/* 컨텐츠 - flex로 변경 (모바일: 세로, 데스크톱: 가로 역순 + gap) */}
        <div className="flex flex-col lg:flex-row-reverse lg:gap-12 mb-6 md:mb-12 lg:mb-14">
          {/* 리더보드 이미지 (모바일: 상단, 데스크톱: 우측) */}
          <div className="flex items-center justify-center lg:w-1/2 lg:justify-end">
            {/* 리더보드 이미지 - 어두운 배경 버전 사용 */}
            <div className="w-full max-w-xl lg:max-w-none">
              <img
                src={leaderboardDark}
                alt="Leaderboard Preview"
                className="w-auto max-h-[560px] rounded-xl shadow-lg border border-nasun-white"
              />
            </div>
          </div>

          {/* 텍스트 박스들 (모바일: 하단, 데스크톱: 좌측) */}

          <div className="flex flex-col gap-6 lg:justify-between items-center max-w-xl mt-6 lg:mt-0 mx-auto lg:mx-0 lg:w-1/2">
            {/* LEADERBOARD 박스 */}
            <div className="w-full bg-nasun-white/90 border-nasun-white rounded-xl p-4 md:p-5 lg:p-6 shadow-lg">
              <Tag variant="outlineC5" size="md" className="items-start font-medium">
                {t("wave1.leaderboard.title")}
              </Tag>
              <p className="text-base text-nasun-black/80 pt-4">
                {t("wave1.leaderboard.description")}
              </p>
              <div className="flex justify-end">
                <ActionLink to="/wave1/leaderboard-info" variant="actionDark" className="px-6 py-3">
                  {t("wave1.leaderboard.cta")}
                </ActionLink>
              </div>
            </div>

            {/* BATTALION NFT 박스 */}
            <div className="w-full bg-nasun-white/90 border-nasun-white rounded-xl p-4 md:p-5 lg:p-6 shadow-lg">
              <Tag variant="outlineC5" size="md" className="items-start font-medium">
                {t("wave1.battalionNft.title")}
              </Tag>
              <p className="text-base text-nasun-black/80 pt-4">
                {t("wave1.battalionNft.description")}
              </p>
              <div className="flex justify-end">
                <ActionLink to="/wave1/battalion-nft" variant="actionDark" className="px-6 py-3">
                  {t("wave1.battalionNft.cta")}
                </ActionLink>
              </div>
            </div>

            {/* EARLY CONTRIBUTOR 박스 */}
            <div className="w-full bg-nasun-white/90 border-nasun-white rounded-xl p-4 md:p-5 lg:p-6 shadow-lg">
              <Tag variant="outlineC5" size="md" className="items-start font-medium">
                {t("wave1.earlyContributor.title")}
              </Tag>
              <p className="text-base text-nasun-black/80 pt-4">
                {t("wave1.earlyContributor.description")}
              </p>
              <div className="flex justify-end">
                <ActionLink to="/wave1/early-contributors" variant="actionDark" className="px-6 py-3">
                  {t("wave1.earlyContributor.cta")}
                </ActionLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(Wave1Section);
