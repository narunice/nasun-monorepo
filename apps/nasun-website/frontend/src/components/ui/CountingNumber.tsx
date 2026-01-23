import { useRef } from "react";
import { useInView } from "framer-motion";
import { useCountingAnimation } from "@/hooks/useCountingAnimation";

interface CountingNumberProps {
  value: string;
  duration?: number;
  delay?: number;
  className?: string;
}

export const CountingNumber = ({
  value,
  duration = 1.5,
  delay = 0,
  className,
}: CountingNumberProps) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  // Parse numeric value and suffix (e.g., "10+" → { num: 10, suffix: "+" })
  const match = value.match(/^(\d+)(.*)$/);
  const targetNum = match ? parseInt(match[1], 10) : 0;
  const suffix = match ? match[2] : "";

  const displayValue = useCountingAnimation({
    targetValue: targetNum,
    duration,
    delay,
    isInView,
  });

  return (
    <span ref={ref} className={className}>
      {displayValue}
      {suffix}
    </span>
  );
};
