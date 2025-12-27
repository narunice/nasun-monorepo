import { cn } from "../../utils/utils"; // 기존 cn 유틸리티 임포트

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-gray-300/40 bg-gray-700/20", className)}
      {...props}
    />
  );
}
