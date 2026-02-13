import React, { useState, useEffect } from "react";
import { SectionLayout } from "@/components/layout/SectionLayout";

// 배경 이미지
import bgImageDesktop from "@/assets/images/robot-arena-hq.webp";
import bgImageMobile from "@/assets/images/robot-arena-mobile.webp";
import { FadeInUp } from "@/components/ui/FadeInUp";

/**
 * GenSolHeroSection 컴포넌트
 *
 * Gen Sol 페이지의 히어로 섹션
 * - 전체 화면 높이
 * - 배경: robot-arena 이미지 (데스크톱/모바일 반응형)
 * - 하단 그래디언트 오버레이
 * - 중앙 하단: 타이틀 + 설명 텍스트
 */
function GenSolHeroSection() {
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
    <SectionLayout className="lg:h-screen lg:min-h-screen overflow-hidden !p-0 !gap-0 bg-nasun-black">
      {/* ============ 데스크톱 레이아웃 (lg 이상) ============ */}
      {/* 데스크톱 배경 - object-cover 전체 화면 */}
      <div className="hidden lg:block absolute inset-0 z-0">
        <img
          src={bgImage}
          alt="Gen Sol Robot Arena"
          className="w-full h-full object-cover object-center"
        />
        {/* 하단 그래디언트 오버레이 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, #191615 0%, #191615 15%, rgba(25, 22, 21, 0.7) 40%, transparent 65%)",
          }}
        />
      </div>

      {/* 데스크톱 콘텐츠 - 중앙 하단 */}

      <div className="hidden lg:block absolute inset-x-0 bottom-[14%] z-20 text-center px-12 lg:px-20">
        <div className="items-center mx-auto">
          <FadeInUp>
            <img
              src="/GensolWordmarkWhite.svg"
              alt="GEN SOL"
              className="h-16 xl:h-20 w-auto mx-auto mb-12"
            />
            <p className=" text-nasun-white/80 text-base/snug xl:text-lg/snug lg:max-w-[940px] xl:max-w-[1060px] mx-auto">
              A bold sci-fi universe designed to power games, films, streaming shows and merchandise
              at a global scale. Gen Sol is an expansive world with deep lore, striking visuals, and
              compelling characters driven by purpose and conflict. Beyond traditional mediums, we
              aim to pioneer new forms of entertainment that blur the lines between the digital and
              physical worlds.
            </p>
          </FadeInUp>
        </div>
      </div>

      {/* ============ 모바일/태블릿 레이아웃 (lg 미만) ============ */}
      <div className="lg:hidden flex flex-col pt-[20%] md:pt-[8%]">
        {/* 이미지 영역 */}
        <div className="relative">
          <img
            src={bgImage}
            alt="Gen Sol Robot Arena"
            className="w-full h-auto object-contain my-[1px]"
          />
          {/* 이미지 오버레이 - 상단/하단 모두 nasun-black으로 페이드 */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                linear-gradient(to bottom, #191615 0%, transparent 10%),
                linear-gradient(to top, #191615 0%, #191615 5%, rgba(25, 22, 21, 0.1) 40%, transparent 65%)
              `,
            }}
          />
        </div>

        {/* 텍스트 콘텐츠 - 이미지 하단과 겹치게 배치 */}
        <div className="relative mt-[5%] md:-mt-[2%] z-20 text-center px-6 md:px-12 pb-16 md:pb-20 mx-auto ">
          <div className="">
            <img
              src="/GensolWordmarkWhite.svg"
              alt="GEN SOL"
              className="h-10 md:h-12 w-auto mx-auto mb-6"
            />
            <p className="text-nasun-white/80 text-base/snug xl:text-lg/snug max-w-[410px] md:max-w-[590px] mx-auto pt-4">
              A bold sci-fi universe designed to power games, films, streaming shows and merchandise
              at a global scale. Gen Sol is an expansive world with deep lore, striking visuals, and
              compelling characters driven by purpose and conflict. Beyond traditional mediums, we
              aim to pioneer new forms of entertainment that blur the lines between the digital and
              physical worlds.
            </p>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(GenSolHeroSection);
