import React from "react";

interface SectionTitleProps {
  children: React.ReactNode;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  color?: "scarlet" | "white" | "black" | "pd";
  className?: string;
}

/**
 * SectionTitle 컴포넌트
 *
 * 웹사이트 섹션에서 사용되는 재사용 가능한 타이틀 컴포넌트
 * 크기는 글로벌 CSS(index.css)의 h1~h6 스타일을 따릅니다.
 *
 * @param children - 타이틀 텍스트
 * @param as - HTML 헤딩 태그 (기본값: "h2")
 * @param color - 색상 ("scarlet" | "white" | "black", 기본값: "white")
 * @param className - 추가 CSS 클래스 (정렬 등 커스텀 스타일)
 *
 * @example
 * // VisionSection 스타일 (h1 사용, scarlet color, 반응형 정렬)
 * <SectionTitle as="h1" color="scarlet" className="uppercase text-center md:text-right">
 *   Vision
 * </SectionTitle>
 */
export const SectionTitle: React.FC<SectionTitleProps> = ({
  children,
  as: Component = "h2",
  color = "white",
  className = "",
}) => {
  // 색상 클래스 (다크 모드 기본, !important로 글로벌 CSS 덮어쓰기)
  const colorClasses = {
    scarlet: "text-nasun-scarlet ",
    white: "text-nasun-white/90", // 다크 모드 기본 색상
    black: "text-nasun-black/90",
    pd: "text-pd5", // Pado navy theme (cool white)
  };

  return (
    <Component className={`${colorClasses[color]} mb-2 md:mb-3 lg:mb-4 ${className}`.trim()}>
      {children}
    </Component>
  );
};

export default SectionTitle;
