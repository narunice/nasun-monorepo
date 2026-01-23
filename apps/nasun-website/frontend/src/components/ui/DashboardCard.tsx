/**
 * DashboardCard Component
 *
 * A flexible card component for the My Account dashboard.
 * Supports multiple variants for different use cases.
 */

import React from "react";

interface DashboardCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "hero" | "compact" | "danger";
}

const variantStyles = {
  default: "bg-gray-800/30 border border-nasun-c5/40 hover:border-nasun-c5/50",
  hero: "bg-gradient-to-br from-nasun-c6/50 to-nasun-c3/5 border border-nasun-c3/40",
  compact: "bg-nasun-c6/30 border border-nasun-c5/20",
  danger: "bg-red-950/30 border border-red-900/50",
};

export const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  children,
  className = "",
  variant = "default",
  ...props
}) => {
  return (
    <div
      className={`rounded-sm p-4 lg:p-6 transition-all duration-200 ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {title && (
        <h3 className="text-sm font-medium text-nasun-white/60 uppercase tracking-wide mb-3">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
};

export default DashboardCard;