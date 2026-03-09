/**
 * Error Alert Component
 *
 * @description
 * 에러 및 경고 메시지를 표시하는 공통 컴포넌트
 */

import React from "react";
import { AlertCircle, AlertTriangle } from "lucide-react";

interface ErrorAlertProps {
  message: string | null;
  variant?: "error" | "warning";
  className?: string;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  message,
  variant = "error",
  className = "",
}) => {
  if (!message) return null;

  const variantStyles = {
    error: {
      container: "bg-red-900/20 border-red-700",
      text: "text-red-300",
      icon: <AlertCircle className="w-5 h-5 text-red-500" />,
    },
    warning: {
      container: "bg-yellow-900/20 border-yellow-700",
      text: "text-yellow-300",
      icon: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
    },
  };

  const styles = variantStyles[variant];

  return (
    <div
      className={`mb-6 p-4 rounded-lg border ${styles.container} max-w-3xl mx-auto ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{styles.icon}</div>
        <p className={`${styles.text} flex-1`}>{message}</p>
      </div>
    </div>
  );
};
