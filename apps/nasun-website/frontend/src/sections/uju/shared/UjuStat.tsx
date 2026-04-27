import { ReactNode } from "react";

type Tone = "default" | "violet" | "lavender" | "cyan" | "mint" | "amber" | "coral";

interface UjuStatProps {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: Tone;
  align?: "left" | "right" | "center";
  className?: string;
}

const VALUE_TONE: Record<Tone, string> = {
  default:  "text-uju-primary",
  violet:   "text-pado-violet",
  lavender: "text-pado-lavender",
  cyan:     "text-pado-3",
  mint:     "text-pado-4",
  amber:    "text-nasun-c1",
  coral:    "text-nasun-coral",
};

const ALIGN: Record<NonNullable<UjuStatProps["align"]>, string> = {
  left:   "text-left items-start",
  right:  "text-right items-end",
  center: "text-center items-center",
};

export function UjuStat({
  label,
  value,
  helper,
  tone = "default",
  align = "left",
  className = "",
}: UjuStatProps) {
  return (
    <div className={`flex flex-col gap-1 ${ALIGN[align]} ${className}`}>
      <span className="text-sm font-medium text-uju-secondary">{label}</span>
      <span className={`text-2xl sm:text-3xl font-bold tabular-nums leading-none ${VALUE_TONE[tone]}`}>
        {value}
      </span>
      {helper && <span className="text-sm text-uju-secondary">{helper}</span>}
    </div>
  );
}
