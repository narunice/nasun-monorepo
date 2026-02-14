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
  | "white"
  | "n1"
  | "n2"
  | "n3"
  | "n4"
  | "n5"
  | "w1"
  | "w2"
  | "w3"
  | "w4"
  | "w5"
  | "nw1"
  | "nw2"
  | "nw3"
  | "nw4"
  | "nw0";

type PaddingVariant = "md" | "sm";

const variantStyles: Record<ColorVariant, string> = {
  default: "border-nasun-c5/50 bg-nasun-c6/90", // 현재 기본값 (c5 border + c6 bg)
  white: "border-nasun-white/50 bg-nasun-white/5",
  c1: "border-nasun-c1/50 bg-[#312107]/40",
  c2: "border-nasun-c2/50 bg-[#312d20]/40",
  c3: "border-nasun-c3/50 bg-[#1d2d2a]/40",
  c4: "border-nasun-c4/50 bg-[#0d1b25]/40",
  c5: "border-nasun-c5/50 bg-[#081427]/40",
  c6: "border-nasun-c6/50 bg-nasun-c6/90",
  scarlet: "border-nasun-scarlet/50 bg-[#320900]/90",
  coral: "border-nasun-coral/50 bg-[#330a0a]/90",
  "gensol-red": "border-nasun-gensol-red/50 bg-nasun-gensol-shade/90",
  n1: "border-nasun-white/40 bg-nasun-white/5", // white style
  n2: "bg-gray-800 border-nasun-white/10", // token distribution label style
  n3: "bg-gray-800/30 border-nasun-c5/40", // compact card style
  n4: "border-nasun-c4/50 bg-nasun-c4/10", // climber card style
  n5: "bg-gradient-to-br from-nasun-c6/50 to-nasun-c3/5  border-nasun-c3/40", // dashboard hero style
  w1: "border-nasun-white/40 bg-nasun-gray/70",
  w2: "border-nasun-c4/50 bg-[#212E57]/50", // Nasun Network Section style
  w3: " border-nasun-white/50 bg-nasun-c4/90", // Nasun Token Section style
  w4: "border-nasun-white/40 bg-nasun-gray/70", // Awards Section style
  w5: "border-nasun-white/40 bg-[#3D3D3D]",
  nw1: "border-nasun-nw4/40 bg-nasun-nw2/20", // NW standard card (light border)
  nw2: "border-nasun-nw1/40 bg-nasun-nw2/20", // NW medium card (nw1 border)
  nw3: "border-nasun-nw2/40 bg-nasun-nw3/30", // NW dark card (modal panels)
  nw4: "border-nasun-nw4/40 bg-nasun-nw4/10", // NW accent card (nw4 light blue)
  nw0: "border-nasun-nw4/30 bg-[#212E57]/50", // NW accent card (nw4 light blue) -
};

const paddingStyles: Record<PaddingVariant, string> = {
  md: "px-4 md:px-6 lg:px-8 py-3 md:py-5 lg:py-7",
  sm: "px-4 md:px-5 lg:px-6 py-3 md:py-4 lg:py-5",
};

interface OuterBoxProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  color?: ColorVariant;
  padding?: PaddingVariant;
}

export const OuterBox: React.FC<OuterBoxProps> = ({
  children,
  className = "",
  color = "n1",
  padding = "md",
  ...props
}) => {
  const paddingClass = paddingStyles[padding];

  return (
    <div
      className={`${paddingClass} backdrop-blur-lg rounded-sm shadow-lg border ${variantStyles[color]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
