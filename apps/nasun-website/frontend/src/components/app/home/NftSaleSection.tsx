import React, { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import nftCanyonsDesktopMP4 from "../../../assets/videos/Homepage-Founders-Nft-Canyons-rf30.mp4";
import nftCanyonsMobileMP4 from "../../../assets/videos/Homepage-Founders-Nft-Canyons-mobile-rf25.mp4";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Button } from "@/components/ui/button";

/**
 * NftSaleSection 컴포넌트 (Genesis NFT - Space Canyons)
 *
 * 우주 협곡 배경 비디오와 Genesis NFT 정보를 표시하는 섹션입니다.
 * 데스크탑/모바일 반응형 동영상 지원
 */
function NftSaleSection() {
  const { t } = useTranslation("home");
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  // 모바일 여부 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // IntersectionObserver - viewport 진입 시 처음부터 재생, 완전히 이탈 시 멈춤
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = videoRef.current;
          if (!video) return;

          if (entry.isIntersecting) {
            // viewport 진입: 항상 처음부터 재생
            video.currentTime = 0;
            video.play().catch(() => {
              // 자동 재생 실패 시 무시
            });
          } else {
            // viewport 완전히 이탈: 즉시 멈춤
            video.pause();
          }
        });
      },
      { threshold: 0 } // 0%: 완전히 벗어나면 멈춤, 조금이라도 보이면 재생
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <SectionLayout className={`relative ${isMobile ? "h-screen" : "min-h-screen"}`}>
      {/* 배경 비디오 컨테이너 - 브라우저 전체 너비 */}
      <div
        ref={containerRef}
        className={`absolute top-0 left-1/2 -translate-x-1/2 w-screen ${
          isMobile ? "h-screen" : "h-full"
        }`}
      >
        {/* 배경 비디오 - 데스크탑/모바일 반응형 */}
        <video
          ref={videoRef}
          loop
          muted
          playsInline
          webkit-playsinline="true"
          preload="metadata"
          x-webkit-airplay="allow"
          key={isMobile ? "mobile" : "desktop"} // 동영상 전환 시 재렌더링
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
          <source src={isMobile ? nftCanyonsMobileMP4 : nftCanyonsDesktopMP4} type="video/mp4" />
        </video>
      </div>

      {/* 컨텐츠 */}
      <div className="max-w-8xl mx-auto relative z-10 px-4 lg:px-8 flex lg:justify-end">
        {/* 모바일: 타이틀 상단, 카드 하단 (justify-between), 데스크톱: 우측 배치 */}
        <div className="min-h-screen flex flex-col w-full lg:w-fit lg:justify-center items-center mt-80 md:mt-64 lg:mt-[25%] pb-8 lg:pt-14 lg:pb-0 px-14 gap-4">
          {/* GENESIS NFT 타이틀 - 가운데 정렬 */}
          <SectionTitle
            as="h3"
            className="font-medium  !font-eurostile !text-nasun-white text-center"
          >
            {t("nftSale.title")}
          </SectionTitle>

          {/* Join Us 버튼 */}
          <div className="w-full flex justify-center">
            <Button
              asChild
              size="xl"
              variant="default"
              className="font-normal !font-founders tracking-wide "
            >
              <Link to="/genesis-nft">{t("nftSale.moreInfo")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(NftSaleSection);
