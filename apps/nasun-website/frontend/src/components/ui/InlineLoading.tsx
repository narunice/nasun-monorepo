/**
 * InlineLoading Component
 *
 * Inline loading indicator with circular spinner + optional text.
 * Used in buttons, modals, and compact areas.
 */

import React from "react";
import { Spinner } from "./Spinner";

interface InlineLoadingProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  colorClass?: string;
  className?: string;
}

const textSizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export const InlineLoading: React.FC<InlineLoadingProps> = ({
  message,
  size = "md",
  colorClass = "text-white",
  className = "",
}) => {
  return (
    <div className={`inline-flex items-center ${className}`}>
      <Spinner size={size} colorClass={colorClass} />
      {message && (
        <span className={`ml-2 text-nasun-white ${textSizeClasses[size]}`}>
          {message}
        </span>
      )}
    </div>
  );
};
