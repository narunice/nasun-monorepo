import { InlineLoading } from "../../ui";

/**
 * 히어로 섹션 로딩 스켈레톤
 * 실제 히어로 섹션이 로드되기 전에 h-screen 높이를 미리 확보하여 레이아웃 시프트를 방지합니다.
 */
export default function HeroSectionSkeleton() {
  return (
    <div className="w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] h-screen overflow-hidden flex items-center justify-center bg-nasun-black">
      <div className="absolute inset-0 bg-nasun-black flex items-center justify-center z-20">
        <InlineLoading message="Loading..." size="lg" />
      </div>
    </div>
  );
}
