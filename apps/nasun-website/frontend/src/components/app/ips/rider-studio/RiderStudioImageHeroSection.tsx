import React from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";

// 배경 이미지
import bgImage from "../../../../assets/images/Firefly_Remove only the single camera and tripod at the far left edge of the image. _Do not r 609126.png";

/**
 * RiderStudioImageHeroSection 컴포넌트
 *
 * Rider Studio 메인 페이지의 이미지 히어로 섹션
 * - 전체 화면 높이
 * - 배경: 영화 촬영 현장 이미지
 * - 하단 그래디언트 오버레이
 * - 중앙 하단: 타이틀
 */
function RiderStudioImageHeroSection() {
  return (
    <SectionLayout className="h-screen min-h-screen overflow-hidden !p-0 !gap-0 bg-nasun-black">
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
          <PageTitle as="h1">RIDER STUDIO</PageTitle>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(RiderStudioImageHeroSection);
