/**
 * Row - Label-value row for receipt sections
 */

interface RowProps {
  label: string;
  children: React.ReactNode;
}

export function Row({ label, children }: RowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="text-[var(--color-text-secondary)]">{children}</span>
    </div>
  );
}
