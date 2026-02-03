/**
 * Section - Receipt section with title and children
 */

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <div className="border-t border-[var(--color-border)] pt-3 mt-3">
      <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="space-y-1.5 text-sm">
        {children}
      </div>
    </div>
  );
}
