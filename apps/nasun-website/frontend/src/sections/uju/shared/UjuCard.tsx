interface UjuCardProps {
  children: React.ReactNode;
  className?: string;
}

export function UjuCard({ children, className = '' }: UjuCardProps) {
  return (
    <div className={`bg-uju-card rounded-xl border border-uju-border p-5 ${className}`}>
      {children}
    </div>
  );
}
