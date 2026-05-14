interface SectionProps {
  title: string;
  children: React.ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <div className="border-t border-uju-border/60 pt-3 mt-3">
      <h4 className="text-xs font-semibold text-uju-secondary/60 uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-1.5 text-sm">{children}</div>
    </div>
  );
}
