import React, { ReactNode } from "react";

/**
 * OuterBox 컴포넌트
 *
 * 표준 큰 박스 컨테이너 (표준 디자인 패턴)
 * - 배경: bg-nasun-c6/90 (90% 투명도, dark navy) - default
 * - Border: border-nasun-c5/50 (파란색 테두리) - default
 * - Backdrop blur + 그림자 효과
 * - 큰 패딩: p-8 md:p-12
 *
 * 사용처:
 * - OpportunitiesSection (외부 박스)
 * - TeamCard (외부 박스)
 * - NFT Event Step1 (외부 박스)
 * - GenesisNftHeroSection
 *
 * @param variant - 색상 프리셋 (default, c1~c6, scarlet)
 */

type ColorVariant =
  | "default"
  | "c1"
  | "c2"
  | "c3"
  | "c4"
  | "c5"
  | "c6"
  | "scarlet"
  | "coral"
  | "gensol-red"
  | "white";

const variantStyles: Record<ColorVariant, string> = {
  default: "border-nasun-c5/50 bg-nasun-c6/90", // 현재 기본값 (c5 border + c6 bg)
  white: "border-nasun-white/50 bg-nasun-white/5",
  c1: "border-nasun-c1/50 bg-[#312107]/90",
  c2: "border-nasun-c2/50 bg-[#312d20]/90",
  c3: "border-nasun-c3/50 bg-[#1d2d2a]/90",
  c4: "border-nasun-c4/50 bg-[#0d1b25]/90",
  c5: "border-nasun-c5/50 bg-[#081427]/90",
  c6: "border-nasun-c6/50 bg-nasun-c6/90",
  scarlet: "border-nasun-scarlet/50 bg-[#320900]/90",
  coral: "border-nasun-coral/50 bg-[#330a0a]/90",
  "gensol-red": "border-nasun-gensol-red/50 bg-nasun-gensol-shade/90",
};

interface OuterBoxProps {
  children: ReactNode;
  className?: string;
  variant?: ColorVariant;
}

export const OuterBox: React.FC<OuterBoxProps> = ({
  children,
  className = "",
  variant = "default",
}) => {
  return (
    <div
      className={`backdrop-blur-md rounded-xl shadow-lg border ${variantStyles[variant]} px-4 md:px-5 lg:px-6 py-3 md:py-4 lg:py-5 ${className}`}
    >
      {children}
    </div>
  );
};
