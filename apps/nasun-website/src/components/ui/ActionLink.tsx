import React from "react";
import { Link } from "react-router-dom";
import { ArrowTopRightIcon } from "@radix-ui/react-icons";
import { Button } from "./button";

interface ActionLinkProps {
  to: string;
  children: React.ReactNode;
  className?: string;
  showArrow?: boolean;
  state?: Record<string, unknown>;
  variant?: "action" | "actionDark";
}

/**
 * ActionLink 컴포넌트
 *
 * Read More, Get Started 등 액션 버튼에 사용되는 재사용 가능한 링크 컴포넌트
 * - 투명 배경 + 반투명 테두리 스타일
 * - 호버 시 테두리 강조 + 배경 나타남
 * - 우측 상단 화살표 아이콘 (선택적)
 *
 * @example
 * <ActionLink to="/leaderboard">Get Started</ActionLink>
 * <ActionLink to="/about" showArrow={false}>Learn More</ActionLink>
 */
export const ActionLink: React.FC<ActionLinkProps> = ({
  to,
  children,
  className,
  showArrow = true,
  state,
  variant = "action",
}) => {
  return (
    <Button asChild variant={variant} className={className}>
      <Link to={to} state={state}>
        {children}
        {showArrow && <ArrowTopRightIcon className="ml-2 w-4 h-4" />}
      </Link>
    </Button>
  );
};

export default ActionLink;
