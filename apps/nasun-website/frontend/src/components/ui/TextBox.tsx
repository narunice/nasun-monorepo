import React from "react";

interface TextBoxProps {
  children: React.ReactNode;
  variant?: "default" | "bordered" | "rounded-lg";
  className?: string;
  maxWidth?: string;
}

interface TextBoxParagraphProps {
  title: string;
  description: string;
  textColor?: string;
  className?: string;
}

interface TextSubtitleProps {
  children: React.ReactNode;
  as?: "h3" | "h4" | "h5" | "h6" | "p";
  color?: "default" | "default-subtle" | "scarlet" | "nasun-black" | "nasun-white";
  opacity?: number; // 10-100
  weight?: "normal" | "medium" | "semibold" | "bold";
  align?:
    | "left"
    | "center"
    | "right"
    | { mobile: "left" | "center" | "right"; desktop: "left" | "center" | "right" };
  className?: string;
}

interface TextDescriptionProps {
  children: React.ReactNode;
  as?: "p" | "div" | "span";
  color?: "default" | "default-subtle" | "scarlet" | "nasun-black" | "nasun-white";
  opacity?: number; // 10-100
  align?:
    | "left"
    | "center"
    | "right"
    | { mobile: "left" | "center" | "right"; desktop: "left" | "center" | "right" };
  className?: string;
}

/**
 * TextBox 컴포넌트
 *
 * 웹사이트 전반에서 사용되는 일관된 스타일의 텍스트 박스 컴포넌트
 *
 * @param variant - 박스 스타일 변형
 *   - default: 테두리 + 반투명 검은 배경 + 블러
 *   - bordered: 두꺼운 테두리만 (배경 없음)
 *   - rounded-lg: 테두리 없음 + 반투명 배경 + 둥근 모서리
 * @param className - 추가 CSS 클래스
 * @param maxWidth - 최대 너비 (Tailwind 클래스)
 */
export const TextBox: React.FC<TextBoxProps> = ({
  children,
  variant = "default",
  className = "",
  maxWidth = "",
}) => {
  const variantStyles = {
    default: "border border-nasun-white bg-black/50 backdrop-blur-[2px]",
    bordered: "border-1 border-nasun-white",
    "rounded-lg": "bg-black/50 rounded-lg backdrop-blur-[2px]",
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
 * TextBoxParagraph 컴포넌트
 *
 * TextBox 내부에서 사용되는 문단 컴포넌트
 * 첫 몇 단어(title)는 크고 굵게, 나머지(description)는 일반 폰트로 표시
 * 줄바꿈 없이 인라인으로 이어지며, 줄간격은 항상 일정하게 유지
 *
 * @param title - 굵고 큰 타이틀 텍스트
 * @param description - 일반 본문 텍스트
 * @param textColor - 텍스트 색상 (기본값: text-nasun-white)
 * @param className - 추가 CSS 클래스
 */
export const TextBoxParagraph: React.FC<TextBoxParagraphProps> = ({
  title,
  description,
  textColor = "text-nasun-white",
  className = "",
}) => {
  return (
    <p className={`!font-rubik ${textColor} ${className}`}>
      <span className="!font-bold ">{title}</span> {description}
    </p>
  );
};

/**
 * TextSubtitle 컴포넌트
 *
 * 섹션 소제목용 재사용 가능한 컴포넌트
 * 크기는 글로벌 CSS(index.css)의 h3~h6, p 스타일을 따릅니다.
 *
 * @param as - HTML 태그 (h3, h4, h5, h6, p, 기본값: "h3")
 * @param color - 색상 옵션
 * @param opacity - 투명도 (10-100, 기본값: 85)
 * @param weight - 폰트 굵기
 * @param align - 텍스트 정렬 (responsive 객체도 가능)
 * @param className - 추가 CSS 클래스
 */
export const TextSubtitle: React.FC<TextSubtitleProps> = ({
  children,
  as: Component = "h4",
  color = "default-subtle",
  opacity = 85,
  weight = "semibold",
  align = "center",
  className = "",
}) => {
  // 색상 클래스
  const colorClasses = {
    default: "",
    "default-subtle": `!text-nasun-white/${opacity}`,
    scarlet: "!text-nasun-scarlet ",
    "nasun-black": "!text-nasun-black",
    "nasun-white": "!text-nasun-white",
  };

  // 폰트 굵기 클래스
  const weightClasses = {
    normal: "!font-normal",
    medium: "!font-medium",
    semibold: "!font-semibold",
    bold: "!font-bold",
  };

  // 텍스트 정렬 클래스 (responsive 지원)
  const alignClass =
    typeof align === "string" ? `text-${align}` : `text-${align.mobile} md:text-${align.desktop}`;

  return (
    <Component
      className={`tracking-wide ${colorClasses[color]} ${weightClasses[weight]} ${alignClass} ${className}`.trim()}
    >
      {children}
    </Component>
  );
};

/**
 * TextDescription 컴포넌트
 *
 * 섹션 본문용 재사용 가능한 컴포넌트
 * 크기는 글로벌 CSS(index.css)의 p 스타일을 따릅니다.
 *
 * @param as - HTML 태그 (p, div, span, 기본값: "p")
 * @param color - 색상 옵션
 * @param opacity - 투명도 (10-100, 기본값: 85)
 * @param align - 텍스트 정렬 (responsive 객체도 가능)
 * @param className - 추가 CSS 클래스
 */
export const TextDescription: React.FC<TextDescriptionProps> = ({
  children,
  as: Component = "p",
  color = "default-subtle",
  opacity = 85,
  align = "center",
  className = "",
}) => {
  // 색상 클래스
  const colorClasses = {
    default: "!text-nasun-white",
    "default-subtle": `!text-nasun-white/${opacity}`,
    scarlet: "!text-nasun-scarlet ",
    "nasun-black": "!text-nasun-black",
    "nasun-white": "!text-nasun-white",
  };

  // 텍스트 정렬 클래스 (responsive 지원)
  const alignClass =
    typeof align === "string" ? `text-${align}` : `text-${align.mobile} md:text-${align.desktop}`;

  return (
    <Component className={`tracking-wide ${colorClasses[color]} ${alignClass} ${className}`.trim()}>
      {children}
    </Component>
  );
};

export default TextBox;
