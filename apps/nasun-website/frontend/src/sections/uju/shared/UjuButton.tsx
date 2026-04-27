import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface UjuButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-pado-violet text-white hover:bg-pado-lavender disabled:bg-pado-violet/40 disabled:text-white/70",
  secondary:
    "bg-pado-violet/15 text-pado-lavender border border-pado-violet/40 hover:bg-pado-violet/25 hover:text-white disabled:opacity-70",
  ghost:
    "bg-transparent text-uju-secondary border border-uju-border hover:text-uju-primary hover:border-pado-violet/40 disabled:opacity-70",
  danger:
    "bg-nasun-coral/20 text-nasun-coral border border-nasun-coral/40 hover:bg-nasun-coral/30 hover:text-white disabled:opacity-70",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-2 text-sm min-h-[36px]",
  md: "px-4 py-2.5 text-sm min-h-[44px]",
  lg: "px-5 py-3 text-base min-h-[48px]",
};

export const UjuButton = forwardRef<HTMLButtonElement, UjuButtonProps>(
  ({ variant = "primary", size = "md", fullWidth = false, className = "", ...rest }, ref) => {
    return (
      <button
        ref={ref}
        {...rest}
        className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      />
    );
  },
);
UjuButton.displayName = "UjuButton";
