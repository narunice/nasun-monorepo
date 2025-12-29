/**
 * StatCard Component
 *
 * A compact card for displaying statistics with optional trend indicators.
 * Used in ProfileHeroCard and other dashboard sections.
 */

import React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  icon?: React.ReactNode;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  trend,
  icon,
  className = "",
}) => {
  return (
    <div
      className={`bg-nasun-c6/50 rounded-lg p-3 lg:p-4 ${className}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-nasun-white/60">{icon}</span>}
        <span className="text-xs lg:text-sm text-nasun-white/60 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl lg:text-2xl font-bold text-nasun-white">
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        {trend && (
          <span
            className={`text-xs lg:text-sm font-medium ${
              trend.direction === "up" ? "text-green-400" : "text-red-400"
            }`}
          >
            {trend.direction === "up" ? "▲" : "▼"} {Math.abs(trend.value)}
          </span>
        )}
      </div>
    </div>
  );
};

export default StatCard;
