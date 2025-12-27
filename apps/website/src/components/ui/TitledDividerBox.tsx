import { ReactNode } from "react";

interface TitledDividerBoxProps {
  /** 박스 상단의 메인 타이틀 (예: "VISION") */
  mainTitle: string;
  /** 메인 타이틀 색상 (기본값: "text-nasun-white") */
  titleColor?: string;
  /** 구분선 아래의 소제목 (볼드) */
  subtitle?: string;
  /** 본문 내용 */
  description: string;
  /** 추가 커스텀 내용 */
  children?: ReactNode;
  /** 커스텀 클래스명 */
  className?: string;
}

/**
 * TitledDividerBox Component
 *
 * 메인 타이틀이 박스 안 상단에 위치하고, 구분선으로 나뉜 후
 * 소제목과 본문이 표시되는 재사용 가능한 컴포넌트입니다.
 *
 * @example
 * <TitledDividerBox
 *   mainTitle="VISION"
 *   subtitle="On & Off-Chain Consensus"
 *   description="Nasun community manages..."
 * />
 */
export const TitledDividerBox = ({
  mainTitle,
  titleColor = "text-nasun-white",
  subtitle,
  description,
  children,
  className = "",
}: TitledDividerBoxProps) => {
  return (
    <div
      className={`py-4 md:py-6 lg:py-8 px-10 md:px-12 lg:px-14 w-full
         bg-gray-900/10
        border  border-gray-400/30
        backdrop-blur-md
        ${className}`}
    >
      <div className="flex flex-col">
        {/* 메인 타이틀 */}
        <h2
          className={`text-3xl md:text-4xl lg:text-5xl font-bold ${titleColor} tracking-wider self-end uppercase`}
        >
          {mainTitle}
        </h2>

        {/* 구분선 */}
        <div className="h-px w-full bg-gray-400/50 mb-4 md:mb-6 lg:mb-8" />

        {/* 소제목 (옵션) */}
        {subtitle && (
          <h3 className="text-base md:text-lg font-bold text-nasun-white">{subtitle}</h3>
        )}

        {/* 본문 */}
        <p className="text-sm md:text-base text-nasun-white">{description}</p>

        {/* 추가 내용 (옵션) */}
        {children && <div className="w-full mt-2 text-gray-200">{children}</div>}
      </div>
    </div>
  );
};
