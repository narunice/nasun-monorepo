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
  valueClassName?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  trend,
  icon,
  className = "",
  valueClassName,
}) => {
  return (
    <div
      className={`bg-gray-800/80 rounded-lg p-3 lg:p-4 text-center ${className}`}
    >
      <div className="flex items-center justify-center gap-2 mb-1">
        {icon && <span className="text-nasun-white/60">{icon}</span>}
        <span className="text-sm font-light text-nasun-white/60 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="flex items-baseline justify-center gap-2">
        <span className={`text-lg font-bold ${valueClassName ?? 'text-nasun-white'}`}>
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
