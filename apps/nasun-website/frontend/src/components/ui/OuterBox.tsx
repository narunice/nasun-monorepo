import React, { ReactNode } from "react";
import { cn } from "../../utils/utils";

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
  | "noborder"
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
  | "nw0"
  | "pd1"
  | "pd0"
  | "sf1"
  | "sf2"
  | "sf3"
  | "sf-gold"
  | "br1"
  | "br2"
  | "br3";

type PaddingVariant = "lg" | "md" | "sm";

const variantStyles: Record<ColorVariant, string> = {
  default: "border-nasun-c5/50 bg-nasun-c6/90", // 현재 기본값 (c5 border + c6 bg)
  noborder: "border-none", // border 없는 버전 (c6 bg)
  white: "border-white/40 bg-white/5",
  c1: "border-nasun-c1/50 bg-[#312107]/40",
  c2: "border-nasun-c2/50 bg-[#312d20]/40",
  c3: "border-nasun-c3/50 bg-[#1d2d2a]/40",
  c4: "border-nasun-c4/50 bg-[#0d1b25]/40",
  c5: "border-nasun-c5/30 bg-[#081427]/50",
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
  nw1: "border-gray-700/70 bg-gray-950/50", // NW standard card (light border)
  nw2: "border-nasun-nw1/40 bg-nasun-nw2/20", // NW medium card (nw1 border)
  nw3: "border-nasun-nw2/40 bg-nasun-nw3/30", // NW dark card (modal panels)
  nw4: "border-nasun-nw4/40 bg-nasun-nw4/10", // NW accent card (nw4 light blue)
  nw0: "border-nasun-nw4/30 bg-[#212E57]/50", // NW accent card (nw4 light blue) -
  pd1: "border-pado-2/50 bg-[#111a28]", // Pado teal accent border
  pd0: "border-pd3/50 bg-pd4/15", // Pado muted border
  sf1: "border-sf-orange/30 bg-black/20", // GenSol sci-fi card
  sf2: "border-sf-yellow/30 bg-black/20", // GenSol sci-fi card alternative
  sf3: "border-sf-blue/40 bg-sf-blue/10", // GenSol sci-fi card alternative 2
  "sf-gold": "border-none bg-[#f1a403]", // GenSol gold solid card
  br1: "border-br-1/40 bg-br-1", // Baram mint accent
  br2: "border-br-2/40 bg-br-2/30", // Baram blue accent
  br3: "border-br-3/40 bg-br-3/30", // Baram lavender accent
};

const paddingStyles: Record<PaddingVariant, string> = {
  lg: "px-6 md:px-8 lg:px-10 py-5 md:py-7 lg:py-9",
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
      className={cn(
        paddingClass,
        "backdrop-blur-lg rounded-sm shadow-lg border",
        variantStyles[color],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};
