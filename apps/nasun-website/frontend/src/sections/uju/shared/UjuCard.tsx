interface UjuCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "accent" | "spotlight";
  as?: "div" | "section" | "article";
}

// All uju section surfaces share a glassmorphism base (bg-uju-card/50 + backdrop-blur-sm).
// spotlight adds a teal ring and glow on top.
const VARIANT_CLASSES: Record<NonNullable<UjuCardProps["variant"]>, string> = {
  default:
    "bg-gray-950/50 backdrop-blur-sm border-uju-border/60 shadow-[0_4px_24px_rgba(14,28,36,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]",
  accent:
    "bg-gray-950/50 backdrop-blur-sm border-uju-border/60 shadow-[0_4px_24px_rgba(14,28,36,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]",
  spotlight:
    "bg-gray-950/50 backdrop-blur-sm border-pado-2/60 ring-1 ring-pado-2/35 shadow-[0_4px_24px_rgba(14,28,36,0.5),0_0_20px_rgba(59,185,216,0.08),inset_0_1px_0_rgba(255,255,255,0.06)]",
};

export function UjuCard({
  children,
  className = "",
  variant = "default",
  as: Tag = "div",
}: UjuCardProps) {
  return (
    <Tag
      className={`rounded-lg border p-6 sm:p-7 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </Tag>
  );
}
