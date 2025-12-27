import React from "react";
import { Link } from "react-router-dom";

interface CtaBoxProps {
  children: React.ReactNode;
  variant: "default" | "bordered" | "rounded-lg";
  className?: string;
  maxWidth?: string;
}

interface CtaBoxContentProps {
  title: string;
  description: string;
  linkTo: string;
  linkText: string;
}

/**
 * CtaBox 컴포넌트
 *
 * Wave1 섹션 우측의 CTA(Call-to-Action) 박스 컴포넌트
 * TextBox와 반대되는 light/dark 모드 스타일을 가짐
 *
 * - Dark mode: 밝은 배경 + 어두운 텍스트
 * - Light mode: 어두운 배경 + 밝은 텍스트
 *
 * @param variant - 박스 스타일 변형
 *   - default: 테두리 + 반투명 밝은 배경 + 블러 (TextBox의 반대)
 *   - bordered: 두꺼운 테두리만 (배경 없음)
 *   - rounded-lg: 테두리 없음 + 반투명 배경 + 둥근 모서리
 * @param children - 박스 내부 컨텐츠
 * @param className - 추가 CSS 클래스
 * @param maxWidth - 최대 너비 (Tailwind 클래스)
 */
export const CtaBox: React.FC<CtaBoxProps> = ({
  children,
  variant = "default",
  className = "",
  maxWidth = "",
}) => {
  const variantStyles = {
    default:
      "border border-nasun-black border-nasun-white bg-white/90 bg-white/90 backdrop-blur-[2px]",
    bordered: "border-1 border-nasun-black border-nasun-white",
    "rounded-lg": "bg-black/50 bg-white/90 rounded-lg backdrop-blur-[2px]",
  };

  return (
    <div
      className={`p-8 md:p-10 lg:p-12 flex flex-col gap-6 ${variantStyles[variant]} ${maxWidth} ${className}`}
    >
      {children}
    </div>
  );
};

/**
 * CtaBoxContent 컴포넌트
 *
 * CtaBox 내부에서 사용되는 컨텐츠 컴포넌트
 * 타이틀 + 설명 + 링크 패턴을 제공
 *
 * @param title - 굵고 큰 타이틀 텍스트
 * @param description - 일반 본문 텍스트
 * @param linkTo - 링크 경로
 * @param linkText - 링크 텍스트 (CTA)
 */
export const CtaBoxContent: React.FC<CtaBoxContentProps> = ({
  title,
  description,
  linkTo,
  linkText,
}) => {
  return (
    <>
      <p className="!font-rubik text-base md:text-lg text-nasun-black !leading-loose">
        <span className="!font-bold text-xl md:text-2xl">{title}</span> {description}
      </p>
      <Link
        to={linkTo}
        className="!font-rubik text-base md:text-lg text-nasun-black hover:text-black underline mt-4 inline-block"
      >
        {linkText}
      </Link>
    </>
  );
};

export default CtaBox;
