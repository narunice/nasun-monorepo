import { ReactNode } from "react";

type Tone = "neutral" | "violet" | "lavender" | "cyan" | "mint" | "amber" | "coral";

interface UjuBadgeProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}

const TONE: Record<Tone, string> = {
  neutral:  "bg-uju-border text-uju-primary border-uju-border",
  violet:   "bg-pado-violet/15 text-pado-lavender border-pado-violet/40",
  lavender: "bg-pado-lavender/15 text-pado-lavender border-pado-lavender/40",
  cyan:     "bg-pado-3/15 text-pado-3 border-pado-3/40",
  mint:     "bg-pado-4/15 text-pado-4 border-pado-4/40",
  amber:    "bg-nasun-c1/15 text-nasun-c1 border-nasun-c1/40",
  coral:    "bg-nasun-coral/15 text-nasun-coral border-nasun-coral/40",
};

export function UjuBadge({ children, tone = "neutral", className = "" }: UjuBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-base font-medium leading-tight ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
