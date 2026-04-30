interface UjuCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "accent" | "spotlight";
  as?: "div" | "section" | "article";
}

// All uju section surfaces share `bg-slate-900 border-pd2` for visual
// consistency. spotlight retains its ring accent on top of the same base.
const VARIANT_CLASSES: Record<NonNullable<UjuCardProps["variant"]>, string> = {
  default: "bg-slate-900 border-pd2",
  accent: "bg-slate-900 border-pd2",
  spotlight:
    "bg-slate-900 border-pd2 ring-1 ring-pado-2/20 shadow-[0_0_0_1px_rgba(59,185,216,0.15)]",
};

export function UjuCard({
  children,
  className = "",
  variant = "default",
  as: Tag = "div",
}: UjuCardProps) {
  return (
    <Tag
      className={`rounded-lg border p-5 sm:p-6 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </Tag>
  );
}
