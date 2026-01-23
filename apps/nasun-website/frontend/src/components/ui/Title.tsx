import React from "react";

interface TitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children?: React.ReactNode;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  align?: "center" | "left";
  className?: string;
  textColor?: string;
}

/**
 * Title 컴포넌트
 *
 * 웹사이트 섹션에서 사용되는 일관된 스타일의 타이틀 컴포넌트
 *
 * @param children - 타이틀 텍스트
 * @param as - HTML 헤딩 태그 ("h1" | "h2" | "h3" | "h4" | "h5" | "h6", 기본값: "h1")
 * @param align - 정렬 방식 ("center" | "left", 기본값: "center")
 * @param className - 추가 CSS 클래스
 * @param textColor - 텍스트 색상 (기본값: "text-nasun-white")
 */
export const Title: React.FC<TitleProps> = ({
  children,
  as: Component = "h1",
  align = "center",
  className = "",
  textColor = "text-nasun-white",
  ...props
}) => {
  const alignmentClass = align === "center" ? "text-center" : "text-left";

  return (
    <Component
      className={`!font-rubik mb-1 md:mb-2 lg:mb-3 xl:mb-4 tracking-normal ${textColor} ${alignmentClass} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
};

export default Title;
