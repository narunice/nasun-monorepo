/**
 * Spinner Component
 *
 * Unified loading spinner component for consistent loading states across the app.
 * Uses nasun-c4 color for brand consistency.
 */

import { FC } from "react";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-4 w-4 border",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-2",
};

export const Spinner: FC<SpinnerProps> = ({ size = "md", className = "" }) => {
  return (
    <div
      className={`animate-spin rounded-full border-nasun-c4 border-t-transparent ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};
