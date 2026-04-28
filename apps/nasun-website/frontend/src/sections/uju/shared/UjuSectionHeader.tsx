import { ReactNode } from "react";
import { UjuAccentBar } from "./UjuAccentBar";

interface UjuSectionHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  accent?: boolean;
  className?: string;
}

// Header pattern: title + optional subtitle on the left, optional trailing slot on the right.
// `accent` adds a violet vertical bar before the title for visual rhythm.
export function UjuSectionHeader({
  title,
  subtitle,
  trailing,
  accent = false,
  className = "",
}: UjuSectionHeaderProps) {
  return (
    <header
      className={`flex items-start justify-between gap-3 mb-4 ${className}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        {accent && <UjuAccentBar />}
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-semibold !text-white truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="text-base text-uju-secondary mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </header>
  );
}
