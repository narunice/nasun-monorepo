/**
 * DashboardCard Component
 *
 * A flexible card component for the My Account dashboard.
 * Supports multiple variants for different use cases.
 */

import React from "react";

interface DashboardCardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "hero" | "compact" | "danger";
}

const variantStyles = {
  default:
    "bg-nasun-c6/50 border border-nasun-c5/30 hover:border-nasun-c5/50",
  hero: "bg-gradient-to-br from-nasun-c6 to-nasun-c6/80 border border-nasun-c4/30",
  compact: "bg-nasun-c6/30 border border-nasun-c5/20",
  danger: "bg-red-950/30 border border-red-900/50",
};

export const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  children,
  className = "",
  variant = "default",
}) => {
  return (
    <div
      className={`rounded-xl p-4 lg:p-6 transition-all duration-200 ${variantStyles[variant]} ${className}`}
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
