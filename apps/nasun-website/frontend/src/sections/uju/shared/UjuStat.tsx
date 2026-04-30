import { ReactNode } from "react";

type Tone = "default" | "violet" | "lavender" | "cyan" | "aqua" | "mint" | "amber" | "coral" | "pado-gradient";

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
  cyan:     "text-pado-2",
  aqua:     "text-pado-3",
  mint:     "text-pado-4",
  amber:    "text-nasun-c1",
  coral:    "text-nasun-coral",
  "pado-gradient": "bg-gradient-to-r from-pado-2 via-pado-4 to-pado-5 bg-clip-text text-transparent",
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
      <span className="text-base font-light text-uju-secondary">{label}</span>
      <span className={`text-3xl sm:text-4xl font-semibold tabular-nums leading-none ${VALUE_TONE[tone]}`}>
        {value}
      </span>
      {helper && <span className="text-base text-uju-secondary">{helper}</span>}
    </div>
  );
}
