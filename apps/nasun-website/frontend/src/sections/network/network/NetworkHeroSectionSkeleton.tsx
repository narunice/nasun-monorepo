import { InlineLoading } from "@/components/ui/InlineLoading";
import { SectionLayout } from "@/components/layout/SectionLayout";

export default function NetworkHeroSectionSkeleton() {
  // 실제 컴포넌트의 로딩 상태 스타일과 동일하게 설정
  const containerClassName = "relative !p-0 -mt-[50px] md:mt-0 bg-nasun-black h-screen";

  return (
    <SectionLayout className={containerClassName}>
      <div className="absolute inset-0 bg-nasun-black flex items-center justify-center z-20">
        <InlineLoading message="Loading..." size="lg" />
      </div>
    </SectionLayout>
  );
}
