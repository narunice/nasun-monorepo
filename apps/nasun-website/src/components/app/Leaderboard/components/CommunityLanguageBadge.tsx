/**
 * 언어 표시 배지 컴포넌트 (ISO 639-1 기반)
 * NASUN UI Design Guide 준수 - 모노톤 미니멀리즘 디자인
 */

import React from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { getLanguageFlag, getLanguageName, getLanguageColors } from "@/utils/communityLanguage";

interface CommunityLanguageBadgeProps {
  /** 언어 코드 (ISO 639-1: ko, en, ja, zh, unknown) */
  dominantLanguage?: string;
  /** 배지 크기 */
  size?: "sm" | "md" | "lg";
  /** 배지 스타일 변형 */
  variant?: "default" | "minimal" | "text-only";
  /** 툴팁 표시 여부 */
  showTooltip?: boolean;
  /** 애니메이션 활성화 여부 */
  animated?: boolean;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 언어를 시각적으로 표시하는 배지 컴포넌트
 *
 * Features:
 * - 국기 이모지 + 언어 이름 표시
 * - NASUN 모노톤 색상 팔레트 사용
 * - 반응형 크기 조정
 * - 부드러운 애니메이션 효과
 * - 다국어 지원 (한국어/영어)
 * - 접근성 고려 (ARIA 라벨)
 */
export const CommunityLanguageBadge: React.FC<CommunityLanguageBadgeProps> = ({
  dominantLanguage,
  size = "md",
  variant = "default",
  showTooltip = true,
  animated = true,
  className = "",
}) => {
  const { i18n } = useTranslation();
  const currentLocale = i18n.language as "ko" | "en";

  // 언어 정보 가져오기
  const flag = getLanguageFlag(dominantLanguage);
  const name = getLanguageName(dominantLanguage, currentLocale);
  const colors = getLanguageColors(dominantLanguage);

  // 크기별 스타일 정의
  const sizeStyles = {
    sm: {
      container: "px-1.5 py-0.5 gap-1",
      flag: "",
      text: "",
    },
    md: {
      container: "px-2 py-1 gap-1.5",
      flag: "",
      text: "",
    },
    lg: {
      container: "px-3 py-1.5 gap-2",
      flag: "",
      text: "",
    },
  };

  // 변형별 스타일 정의 (NASUN 색상 팔레트 사용)
  const variantStyles = {
    default: `
      inline-flex items-center rounded-lg-full
      bg-${colors.background} 
      text-${colors.text}
      border border-${colors.primary}/20
      ease-out
      hover:bg-${colors.background} hover:border-${colors.primary}/40
      hover:shadow-sm hover:shadow-${colors.primary}/20
    `,
    minimal: `
      inline-flex items-center rounded-lg
      bg-transparent
      text-${colors.text}
      border border-${colors.primary}/15
      ease-out
      hover:bg-${colors.background}
    `,
    "text-only": `
      inline-flex items-center
      text-${colors.text}
      ease-out
      hover:text-${colors.primary}
    `,
  };

  // 애니메이션 설정
  const animationProps = animated
    ? {
        initial: { opacity: 0, scale: 0.9 },
        animate: { opacity: 1, scale: 1 },
        whileHover: { scale: 1.05 },
        transition: { duration: 0.2 }, // removed string-based easing to satisfy framer-motion types
      }
    : {};

  // 언어 코드가 없는 경우 null 반환
  if (!dominantLanguage) {
    return null;
  }

  const Badge = animated ? motion.span : "span";

  return (
    <Badge
      className={`
        ${variantStyles[variant]}
        ${sizeStyles[size].container}
        ${className}
      `}
      title={showTooltip ? `${name}` : undefined}
      aria-label={`${name} 언어 구분`}
      role="img"
      {...(animated ? animationProps : {})}
    >
      {/* 언어 코드 */}
      <span className={sizeStyles[size].flag} role="text" aria-label={`${name} 언어`}>
        {flag}
      </span>

      {/* 언어 이름 (text-only가 아닌 경우만 표시) */}
      {variant !== "text-only" && (
        <span className={`${sizeStyles[size].text} font-medium tracking-wide`}>{name}</span>
      )}
    </Badge>
  );
};

/**
 * 간소화된 언어 코드만 표시하는 컴포넌트
 */
export const CommunityFlagIcon: React.FC<{
  dominantLanguage?: string;
  size?: number;
  className?: string;
}> = ({ dominantLanguage, size = 16, className = "" }) => {
  const flag = getLanguageFlag(dominantLanguage);
  const name = getLanguageName(dominantLanguage);

  if (!dominantLanguage) return null;

  return (
    <span
      className={`inline-block ${className}`}
      style={{ fontSize: `${size}px` }}
      title={`${name}`}
      role="text"
      aria-label={`${name} 언어`}
    >
      {flag}
    </span>
  );
};

export default CommunityLanguageBadge;
