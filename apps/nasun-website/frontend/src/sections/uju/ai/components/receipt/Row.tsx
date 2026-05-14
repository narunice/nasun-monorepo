interface RowProps {
  label: string;
  children: React.ReactNode;
}

export function Row({ label, children }: RowProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-uju-secondary/60">{label}</span>
      <span className="text-uju-secondary">{children}</span>
    </div>
  );
}
