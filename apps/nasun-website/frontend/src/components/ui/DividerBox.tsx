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
  | "black";

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
}

const colorStyles: Record<NasunColor, { border: string; background: string; text: string }> = {
  white: {
    border: "border-nasun-white/70",
    background: "bg-nasun-black/90",
    text: "text-nasun-white",
  },
  scarlet: {
    border: "border-nasun-scarlet",
    background: "bg-nasun-scarlet/5",
    text: "text-nasun-scarlet",
  },
  c1: {
    border: "border-nasun-c1",
    background: "bg-nasun-c1/10",
    text: "text-nasun-c1",
  },
  c2: {
    border: "border-nasun-c2",
    background: "bg-nasun-c2/10",
    text: "text-nasun-c2",
  },
  c3: {
    border: "border-nasun-c3",
    background: "bg-nasun-c3/10",
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
    border: "border-nasun-black/70",
    background: "bg-white/50",
    text: "text-nasun-black",
  },
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
  color = "c3",
  titleClassName = "",
  rightTitleClassName = "",
  descriptionClassName = "",
}: DividerBoxProps) => {
  const styles = colorStyles[color];

  return (
    <div
      className={`p-4 md:p-6 w-full ${styles.background} rounded-lg border backdrop-blur-md backdrop-brightness-50 ${styles.border} ${className}`}
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
      {(title || rightTitle || rightAction) && <hr className={`${styles.border} mb-3 md:mb-4`} />}

      {/* Description (옵셔널) */}
      {description && (
        <p
          className={`text-center md:text-left text-nasun-white/85 text-base mb-3 md:mb-4 ${descriptionClassName}`}
        >
          {description}
        </p>
      )}

      {/* Children (추가 컨텐츠) */}
      {children}
    </div>
  );
};
