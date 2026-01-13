import { ReactNode } from "react";

type NasunColor =
  | "white"
  | "scarlet"
  | "c1"
  | "c2"
  | "c3"
  | "c4"
  | "c5"
  | "c7"
  | "green"
  | "coral"
  | "gensol-red"
  | "black"
  | "n1"
  | "n2"
  | "n3"
  | "n4"
  | "n5"
  | "w1";

type PaddingVariant = "md" | "sm";

interface DividerBoxProps {
  /** 제목 (옵셔널) - 제공하지 않으면 제목과 구분선이 표시되지 않음 */
  title?: string;
  /** 오른쪽 제목 (옵셔널) - title과 함께 사용 시 justify-between 레이아웃 */
  rightTitle?: string;
  /** 오른쪽 액션 (옵셔널) - 버튼이나 링크 등 ReactNode */
  rightAction?: ReactNode;
  /** 제목 옆에 표시할 아이콘 (옵셔널) */
  icon?: ReactNode;
  /** 설명 텍스트 (옵셔널) */
  description?: string;
  /** 추가 컨텐츠 */
  children?: ReactNode;
  /** 추가 CSS 클래스 */
  className?: string;
  /** Nasun 색상 테마 (기본값: c5) */
  color?: NasunColor;
  /** 타이틀 커스텀 클래스 (색상 오버라이드 등) */
  titleClassName?: string;
  /** 오른쪽 타이틀 커스텀 클래스 (색상 오버라이드 등) */
  rightTitleClassName?: string;
  /** Description 커스텀 클래스 (색상 오버라이드 등) */
  descriptionClassName?: string;
  /** 패딩 설정 (기본값: md) */
  padding?: PaddingVariant;
}

const colorStyles: Record<NasunColor, { border: string; background: string; text: string }> = {
  white: {
    border: "border-nasun-white/70",
    background: "bg-nasun-white/70",
    text: "text-nasun-white",
  },
  scarlet: {
    border: "border-nasun-scarlet",
    background: "bg-nasun-scarlet/5",
    text: "text-nasun-scarlet",
  },
  c1: {
    border: "border-nasun-c1/50 hover:border-nasun-c1/40 transition-colors",
    background: "bg-nasun-c1/5 hover:bg-nasun-c1/10 transition-colors",
    text: "text-nasun-c1",
  },
  c2: {
    border: "border-nasun-c2",
    background: "bg-nasun-c2/10",
    text: "text-nasun-c2",
  },
  c3: {
    border: "border-nasun-c3/50 hover:border-nasun-c3/40 transition-colors",
    background: "bg-nasun-c3/10 hover:bg-nasun-c3/5 transition-colors",
    text: "text-nasun-c3",
  },
  c4: {
    border: "border-nasun-c4",
    background: "bg-nasun-c4/10",
    text: "text-nasun-c4",
  },
  c5: {
    border: "border-nasun-c5",
    background: "bg-nasun-c5/10",
    text: "text-nasun-c5",
  },
  c7: {
    border: "border-nasun-c5",
    background: "bg-nasun-c5/10",
    text: "text-nasun-c5",
  },
  green: {
    border: "border-green-500",
    background: "bg-green-950",
    text: "text-green-500",
  },
  coral: {
    border: "border-nasun-coral",
    background: "bg-nasun-coral/10",
    text: "text-nasun-coral",
  },
  "gensol-red": {
    border: "border-nasun-gensol-red",
    background: "bg-nasun-gensol-red/10",
    text: "text-nasun-gensol-red",
  },
  black: {
    border: "border-nasun-black/50",
    background: "bg-nasun-black/80",
    text: "text-nasun-white",
  },
  n1: {
    border: "border-nasun-white/40 hover:border-nasun-white/50 transition-colors",
    background: "bg-nasun-white/5 hover:bg-nasun-white/10 transition-colors",
    text: "text-nasun-white",
  },
  n2: {
    border: "border-nasun-white/10",
    background: "bg-gray-800",
    text: "text-nasun-white",
  },
  n3: {
    border: "border-nasun-c5/40",
    background: "bg-gray-800/30",
    text: "text-nasun-white",
  },
  n4: {
    border: "border-nasun-c4/50",
    background: "bg-nasun-c4/10 ",
    text: "text-nasun-white",
  },
  n5: {
    border: "border-nasun-c3/40",
    background: "bg-gradient-to-br from-nasun-c6/50 to-nasun-c3/5  ",
    text: "text-nasun-white",
  },
  w1: {
    border: "border-nasun-white/40",
    background: "bg-nasun-gray/70",
    text: "text-nasun-white",
  },
};

const paddingStyles: Record<PaddingVariant, string> = {
  md: "px-4 md:px-6 lg:px-8 py-3 md:py-5 lg:py-7",
  sm: "px-4 md:px-5 lg:px-6 py-3 md:py-4 lg:py-5",
};

/**
 * DividerBox Component
 *
 * 제목, 구분선, 설명을 포함한 카드형 박스 컴포넌트
 * - title을 제공하면: 제목 + 구분선 + 설명/children 표시
 * - title을 제공하지 않으면: 설명/children만 표시
 * - color prop으로 테두리, 배경색 설정
 * - title 색상/폰트는 글로벌 CSS 추종 (h6 태그)
 */
export const DividerBox = ({
  title,
  rightTitle,
  rightAction,
  icon,
  description,
  children,
  className = "",
  color = "n2",
  titleClassName = "",
  rightTitleClassName = "",
  descriptionClassName = "",
  padding = "md",
}: DividerBoxProps) => {
  const styles = colorStyles[color];
  const paddingClass = paddingStyles[padding];

  return (
    <div
      className={`${paddingClass} w-full ${styles.background} rounded-lg border backdrop-blur-lg ${styles.border} ${className}`}
    >
      {/* Title (옵셔널) - rightTitle/rightAction이 있으면 justify-between 레이아웃 */}
      {(title || rightTitle || rightAction) && (
        <div className="flex justify-between items-center mb-1">
          <h6
            className={`flex items-center gap-2 uppercase font-medium ${styles.text} ${titleClassName}`}
          >
            {icon}
            {title}
          </h6>
          {rightTitle && (
            <span className={`uppercase font-medium ${rightTitleClassName || titleClassName}`}>
              {rightTitle}
            </span>
          )}
          {rightAction}
        </div>
      )}

      {/* Divider (title이 있을 때만 표시) */}
      {(title || rightTitle || rightAction) && (
        <hr className={`${styles.border} mb-3 md:mb-4 lg:mb-5`} />
      )}

      {/* Description (옵셔널) */}
      {description && (
        <p
          className={`text-center md:text-left text-nasun-white/85 mb-3 md:mb-4 lg:mb-5 ${descriptionClassName}`}
        >
          {description}
        </p>
      )}

      {/* Children (추가 컨텐츠) */}
      {children}
    </div>
  );
};
