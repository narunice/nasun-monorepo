import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { Button } from "../../../ui/button";
import SectionTitle from "../../../ui/SectionTitle";
import { DividerBox } from "../../../ui/DividerBox";

// 배경 이미지
import bgImageDesktop from "../../../../assets/images/spectra-plant-raid.webp";
import bgImageMobile from "../../../../assets/images/spectra-plant-raid-mobile.webp";

/**
 * GenSolIntroSection 컴포넌트
 *
 * Overarching Narrative 섹션
 * - 배경: spectra-plant-raid 이미지 (데스크톱/모바일 반응형)
 * - 제목 + 설명 (우측 정렬)
 * - 3개 카테고리 그리드
 * - WEBSITE 버튼
 */
function GenSolIntroSection() {
  const { t } = useTranslation("genSol");
  const [isMobile, setIsMobile] = useState(false);

  // 반응형 이미지 선택을 위한 viewport 감지
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const bgImage = isMobile ? bgImageMobile : bgImageDesktop;

  return (
    <SectionLayout className="min-h-screen overflow-hidden !p-0 !gap-0 bg-nasun-black">
      {/* ============ 데스크톱 배경 (lg 이상) ============ */}
      <div className="hidden lg:flex absolute inset-0 z-0 items-start justify-center">
        <div className="relative w-full max-w-[1920px]">
          <img src={bgImage} alt="Spectra Plant Raid" className="w-full h-auto object-contain" />
          {/* 하단 그래디언트 오버레이 - 이미지 높이에 맞춤 */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, #191615 0%, #191615 15%, rgba(25, 22, 21, 0.7) 40%, transparent 70%)",
            }}
          />
        </div>
      </div>

      {/* ============ 태블릿 배경 (md ~ lg) ============ */}
      <div className="hidden md:flex lg:hidden absolute inset-0 z-0 items-start justify-center">
        <div className="relative w-full">
          <img
            src={bgImage}
            alt="Spectra Plant Raid"
            className="w-full h-auto object-contain"
            style={{ objectPosition: "60% top" }}
          />
          {/* 그래디언트 오버레이 - 이미지 높이에 맞춤 */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, #191615 0%, #191615 15%, rgba(25, 22, 21, 0.7) 40%, transparent 70%)",
            }}
          />
        </div>
      </div>

      {/* ============ 모바일 배경 (md 미만) - 상단 60% 높이만 채움 ============ */}
      <div className="md:hidden absolute top-0 inset-x-0 z-0">
        <div className="relative w-full h-[55vh]">
          <img
            src={bgImage}
            alt="Spectra Plant Raid"
            className="w-full h-full object-cover"
            style={{ objectPosition: "60% top" }}
          />
          {/* 그래디언트 오버레이 - 이미지 높이에 맞춤 */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, #191615 0%, #191615 15%, rgba(25, 22, 21, 0.7) 40%, transparent 70%)",
            }}
          />
        </div>
      </div>

      {/* 콘텐츠 */}
      <div className="relative z-20 max-w-8xl w-full min-h-screen h-full flex flex-col mx-auto pt-[60%] sm:pt-[50%] md:pt-[35%] pb-12 md:pb-16 px-10 md:px-12 lg:px-20 justify-start ">
        {/* 제목 + 설명 (우측 정렬) */}
        <div className="max-w-[1000px] ml-auto text-right ">
          <SectionTitle as="h2" className="font-semibold uppercase !mb-0 lg:!mb-1">
            {t("narrative.title")}
          </SectionTitle>
          <p className="text-nasun-white/80  ml-auto">{t("narrative.description")}</p>
        </div>

        {/* 구분선 */}
        <div className="border-t border-nasun-c1 my-6 lg:my-8 xl:my-10 max-w-8xl mx-auto w-full" />

        {/* 3개 카테고리 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 lg:gap-10 max-w-7xl mx-auto w-full">
          <DividerBox
            title={t("narrative.category1.title")}
            description={t("narrative.category1.description")}
            color="c1"
          />
          <DividerBox
            title={t("narrative.category2.title")}
            description={t("narrative.category2.description")}
            color="c1"
          />
          <DividerBox
            title={t("narrative.category3.title")}
            description={t("narrative.category3.description")}
            color="c1"
          />
        </div>

        {/* WEBSITE 버튼 */}
        <div className="flex justify-center mt-8 md:mt-10">
          <Button variant="c1" size="xl" className="" asChild>
            <a href={import.meta.env.VITE_GENSOL_URL} target="_blank" rel="noopener noreferrer">
              {t("narrative.button")}
            </a>
          </Button>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(GenSolIntroSection);
