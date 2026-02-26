import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";

// 배경 이미지 (기존 경로 유지)
import bgImage from "../../../assets/images/firefly-rider.webp";
import { FadeInUp } from "@/components/ui/FadeInUp";

/**
 * RiderStudioMainPageContent
 *
 * Rider Studio 메인 페이지 (/ips/riderstudio/main)의 통합 컨텐츠
 * ImageHeroSection과 HeroSection을 통합하고 디자인 가이드를 적용함.
 */
export default function RiderMain() {
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
              LAUNCHING 2026
            </SectionTitle>

            <div className="space-y-2 md:space-y-3 lg:space-y-4">
              <p>Nasun's community will function as a creative studio — acquiring, developing, and managing a slate of narrative projects including films, animation series, and live-action shows. We will establish a transparent, consensus-driven process for greenlighting and shaping stories that the community is passionate about. This approach allows us to manage above-the-line talent effectively while preserving creative freedom across projects.</p>
              <p>As founders, our lifelong passion lies at the intersection of cinema and technology. Naru, as head editor and producer, has contributed to seminal Korean films, while Overclocked has written and directed both sort and feature-length works, led two production and postproduction studios through the transition from film to digital, and was among the first to bring digital filmmaking into mainstream production in South Korea.</p>
              <p>Having spent our lives immersed in all aspects of filmmaking, we believe there has never been a more exciting moment for storytellers — with professional-grade tools now widely accessible and transformative technologies like AI, Web3, and Unreal Engine 5 reshaping what's possible.</p>
              <p>Our ambition for Rider Studio extends beyond creating exceptional films. We aim to pioneer a new era of global filmmaking — one that pushes the boundaries of story, aesthetics, and production while redefining how films are produced, marketed, and distributed. Ultimately, Rider Studio will serve as both a creative engine and an educational platform — showcasing the full professional process of filmmaking and inviting the community to learn, contribute, and innovate with us.</p>
            </div>
          </section>
        </div>
      </SectionLayout>
    </div>
  );
}
