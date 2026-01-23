import { useState, useEffect } from "react";

interface UseCountingAnimationProps {
  targetValue: number;
  duration: number;
  delay: number;
  isInView: boolean;
}

export const useCountingAnimation = ({
  targetValue,
  duration,
  delay,
  isInView,
}: UseCountingAnimationProps) => {
  const [displayValue, setDisplayValue] = useState("0");

  useEffect(() => {
    if (!isInView) return;

    const startTime = performance.now() + delay * 1000;
    let animationFrame: number;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;

      if (elapsed < 0) {
        animationFrame = requestAnimationFrame(animate);
        return;
      }

      const progress = Math.min(elapsed / (duration * 1000), 1);
      // Ease out cubic for smoother deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentNum = Math.floor(easeOut * targetValue);

      setDisplayValue(currentNum.toString());

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setDisplayValue(targetValue.toString());
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, [isInView, targetValue, duration, delay]);

  return displayValue;
};
