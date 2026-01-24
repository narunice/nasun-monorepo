import React from "react";

interface InlineLoadingProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const InlineLoading: React.FC<InlineLoadingProps> = ({
  message,
  size = "md",
  className = "",
}) => {
  const sizeClasses = {
    sm: "h-4 w-4 border-b-2",
    md: "h-6 w-6 border-b-2",
    lg: "h-8 w-8 border-b-2",
  };

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <div className={`inline-flex items-center ${className}`}>
      <div
        className={`animate-spin rounded-full border-gray-100 ${sizeClasses[size]}`}
      ></div>
      {message && (
        <span className={`ml-2 text-nasun-white ${textSizeClasses[size]}`}>
          {message}
        </span>
      )}
    </div>
  );
};
