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
//
// Mobile layout: title and trailing stack vertically so a long title is never
// truncated by a sibling badge/button. Trailing element right-aligns under the
// title block to mirror the desktop side-by-side rhythm. From `sm:` and up
// the header is a single row again with `truncate` re-applied as a safety net
// for unusually long titles in narrow viewports.
export function UjuSectionHeader({
  title,
  subtitle,
  trailing,
  accent = false,
  className = "",
}: UjuSectionHeaderProps) {
  return (
    <header
      className={`flex flex-col gap-3 mb-4 sm:flex-row sm:items-start sm:justify-between ${className}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        {accent && <UjuAccentBar />}
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-semibold !text-white break-words sm:truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="text-base text-uju-secondary mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {trailing && (
        <div className="shrink-0 self-end sm:self-auto">{trailing}</div>
      )}
    </header>
  );
}
