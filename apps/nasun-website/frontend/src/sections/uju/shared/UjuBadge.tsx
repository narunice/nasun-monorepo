import { ReactNode } from "react";

type Tone = "neutral" | "violet" | "lavender" | "cyan" | "mint" | "amber" | "coral";

interface UjuBadgeProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}

// Badges are passive labels. Visually distinguished from buttons by:
//   - rounded-md (not rounded-full pill)
//   - flat tinted background, no border, no shadow, no hover state
//   - tighter padding so they read as inline tags rather than CTAs
const TONE: Record<Tone, string> = {
  neutral:  "bg-uju-border/60 text-uju-primary",
  violet:   "bg-pado-1/20 text-pado-3",
  lavender: "bg-pado-2/15 text-pado-3",
  cyan:     "bg-pado-2/15 text-pado-2",
  mint:     "bg-pado-4/15 text-pado-4",
  amber:    "bg-nasun-c1/15 text-nasun-c1",
  coral:    "bg-nasun-coral/15 text-nasun-coral",
};

export function UjuBadge({ children, tone = "neutral", className = "" }: UjuBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium leading-tight tracking-wide ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
