interface UjuAccentBarProps {
  className?: string;
}

export function UjuAccentBar({ className = "" }: UjuAccentBarProps) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 w-1 h-6 rounded-full bg-gradient-to-b from-pado-5 to-pado-lavender shrink-0 ${className}`}
    />
  );
}
