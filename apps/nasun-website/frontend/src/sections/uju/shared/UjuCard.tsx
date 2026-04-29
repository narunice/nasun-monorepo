interface UjuCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "accent" | "spotlight";
  as?: "div" | "section" | "article";
}

// accent = subtle violet wash, spotlight = lavender ring + violet glow.
const VARIANT_CLASSES: Record<NonNullable<UjuCardProps["variant"]>, string> = {
  default:   "bg-uju-card border-uju-border",
  accent:    "bg-gradient-to-br from-uju-card to-pado-2/10 border-pado-2/30",
  spotlight: "bg-uju-card border-pado-1/40 ring-1 ring-pado-2/20 shadow-[0_0_0_1px_rgba(59,185,216,0.15)]",
};

export function UjuCard({ children, className = "", variant = "default", as: Tag = "div" }: UjuCardProps) {
  return (
    <Tag className={`rounded-2xl border p-5 sm:p-6 ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </Tag>
  );
}
