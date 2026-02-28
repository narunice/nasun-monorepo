/**
 * Spinner Component
 *
 * SVG circular spinner with faint track + rounded arc.
 * Uses currentColor — pair with text-* Tailwind classes.
 */

import { FC } from "react";

interface SpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  colorClass?: string;
  className?: string;
}

const sizes = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
};

export const Spinner: FC<SpinnerProps> = ({ size = "md", colorClass = "text-white", className = "" }) => {
  return (
    <svg
      className={`animate-spinner ${sizes[size]} ${colorClass} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2.5" />
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="32 63"
      />
      <title>Loading...</title>
    </svg>
  );
};
