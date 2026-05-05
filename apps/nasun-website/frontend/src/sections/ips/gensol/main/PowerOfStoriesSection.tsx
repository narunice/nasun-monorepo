import React, { useEffect, useRef } from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
// 배경 이미지
import bgImage from "@/assets/images/boliviainteligente.webp";

function PowerOfStoriesSection() {
  const { t } = useTranslation("genSol");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;

    // Target the DividerBox child directly so opacity animates
    // on the same element as backdrop-filter (avoids stacking context issue)
    const target = el.firstElementChild as HTMLElement | null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          target?.classList.add("animate-fadeInUp");
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <SectionLayout className="!px-8 sm:!px-10 md:!px-12  overflow-hidden bg-nasun-black min-h-[80vh]">
      {/* 배경 이미지 - 섹션 전체 커버 */}
      <div className="absolute inset-0 z-0">
        <img src={bgImage} alt="Background" className="w-full h-full object-cover" />
        <div
          className="absolute inset-0 -mt-[2px]"
          style={{
            background: `
              linear-gradient(to bottom, #191615 0%, transparent 50%),
              radial-gradient(ellipse 115% 100% at 100% 100%, transparent 0%, transparent 10%, #191615 85%)
            `,
          }}
        />
      </div>

      {/* 콘텐츠 */}
      <div ref={boxRef} className="relative z-10 w-full max-w-5xl mx-auto">
        <DividerBox
          color="c1"
          hideDivider={true}
          className="!bg-gray-950/50 !border-sf-orange/40 !backdrop-blur-md w-full mt-20 mb-28 opacity-0 translate-y-[10px]"
        >
          <h3 className="!font-rubik text-center uppercase text-sf-orange font-medium text-2xl md:text-3xl lg:text-4xl mb-2 md:mb-4">
            {t("powerOfStories.title")}
          </h3>
          <div className="space-y-4 md:space-y-6">
            <p>{t("powerOfStories.paragraph1")}</p>
            <p>{t("powerOfStories.paragraph2")}</p>
            <p>{t("powerOfStories.paragraph3")}</p>
          </div>
        </DividerBox>
      </div>
    </SectionLayout>
  );
}

export default React.memo(PowerOfStoriesSection);
