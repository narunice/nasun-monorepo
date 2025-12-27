import React, { ReactNode } from "react";

/**
 * BattalionNftCard Component
 *
 * Battalion NFT 페이지의 모든 스텝 카드를 위한 표준 래퍼 컴포넌트
 *
 * @features
 * - 배경: bg-nasun-c6/60 (60% 투명도, dark navy)
 * - Border: border-nasun-c5 (파란색 테두리)
 * - Backdrop blur + 그림자 효과
 * - 반응형 패딩: p-6 md:p-8 lg:p-10
 * - 최대 너비: max-w-3xl mx-auto
 *
 * @usage
 * <BattalionNftCard>
 *   <h3>Step Title</h3>
 *   <p>Step content</p>
 * </BattalionNftCard>
 */

interface BattalionNftCardProps {
  children: ReactNode;
  className?: string;
}

export const BattalionNftCard: React.FC<BattalionNftCardProps> = ({ children, className = "" }) => {
  return (
    <div
      className={`bg-nasun-c6/60 rounded-xl shadow-lg backdrop-blur-md p-6 md:p-8 lg:p-10 max-w-3xl mx-auto border border-nasun-c5 ${className}`}
    >
      {children}
    </div>
  );
};
