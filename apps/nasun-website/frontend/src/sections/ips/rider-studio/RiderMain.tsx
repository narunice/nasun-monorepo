import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";

// 배경 이미지 (기존 경로 유지)
import bgImage from "../../../assets/images/Firefly_Remove only the single camera and tripod at the far left edge of the image. _Do not r 609126.png";
import { FadeInUp } from "@/components/ui/FadeInUp";

/**
 * RiderStudioMainPageContent
 *
 * Rider Studio 메인 페이지 (/ips/riderstudio/main)의 통합 컨텐츠
 * ImageHeroSection과 HeroSection을 통합하고 디자인 가이드를 적용함.
 */
export default function RiderMain() {
  const { t } = useTranslation("riderStudio");

  return (
    <div className="flex flex-col">
      {/* 
        ========== 1. Image Hero Section (Full Screen) ========== 
        From RiderStudioImageHeroSection
      */}
      <SectionLayout className="h-screen min-h-screen overflow-hidden !p-0 !gap-0 bg-nasun-black relative">
        {/* 배경 이미지 */}
        <div className="absolute inset-0 z-0">
          <img
            src={bgImage}
            alt="Rider Studio Film Set"
            className="w-full h-full object-cover object-center"
          />
          {/* 하단 그래디언트 오버레이 */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, #191615 0%, #191615 10%, rgba(25, 22, 21, 0.6) 35%, transparent 60%)",
            }}
          />
        </div>

        {/* 콘텐츠 - 중앙 하단 */}
        <div className="absolute inset-x-0 bottom-[8%] md:bottom-[10%] z-20 text-center px-6 md:px-12 lg:px-20">
          <div className="items-center mx-auto">
            <FadeInUp>
              <PageTitle as="h1">RIDER STUDIO</PageTitle>
            </FadeInUp>
          </div>
        </div>
      </SectionLayout>

      {/* 
        ========== 2. Text Hero Section ========== 
        From RiderStudioHeroSection
        디자인 가이드의 spacing scale 적용
      */}
      <SectionLayout className="!max-w-6xl !pt-0">
        <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
          <section>
            <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
              {t("hero.subtitle")}
            </SectionTitle>

            <div className="space-y-2 md:space-y-3 lg:space-y-4">
              <p>{t("hero.p1")}</p>
              <p>{t("hero.p2")}</p>
              <p>{t("hero.p3")}</p>
              <p>{t("hero.p4")}</p>
            </div>
          </section>
        </div>
      </SectionLayout>
    </div>
  );
}
