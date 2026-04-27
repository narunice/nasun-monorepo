interface UjuCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "accent" | "spotlight";
  as?: "div" | "section" | "article";
}

// accent = subtle violet wash, spotlight = lavender ring + violet glow.
const VARIANT_CLASSES: Record<NonNullable<UjuCardProps["variant"]>, string> = {
  default:   "bg-uju-card border-uju-border",
  accent:    "bg-gradient-to-br from-uju-card to-pado-violet/5 border-pado-violet/30",
  spotlight: "bg-uju-card border-pado-lavender/40 ring-1 ring-pado-violet/20 shadow-[0_0_0_1px_rgba(124,92,255,0.15)]",
};

export function UjuCard({ children, className = "", variant = "default", as: Tag = "div" }: UjuCardProps) {
  return (
    <Tag className={`rounded-2xl border p-5 sm:p-6 ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </Tag>
  );
}
