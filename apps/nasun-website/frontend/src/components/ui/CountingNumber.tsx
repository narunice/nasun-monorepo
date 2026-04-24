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

  // Parse numeric value and suffix (e.g., "10+" → { num: 10, suffix: "+" }, "7,398" → { num: 7398, suffix: "" })
  const match = value.match(/^([\d,]+)(.*)$/);
  const hasThousandsSeparator = match ? match[1].includes(",") : false;
  const targetNum = match ? parseInt(match[1].replace(/,/g, ""), 10) : 0;
  const suffix = match ? match[2] : "";

  const displayValue = useCountingAnimation({
    targetValue: targetNum,
    duration,
    delay,
    isInView,
  });

  const formatted = hasThousandsSeparator
    ? parseInt(displayValue, 10).toLocaleString("en-US")
    : displayValue;

  return (
    <span ref={ref} className={className}>
      {formatted}
      {suffix}
    </span>
  );
};
