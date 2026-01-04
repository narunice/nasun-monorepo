import React from "react";
import { cn } from "../../utils/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "featured" | "preview";
  hoverEffect?: boolean;
}

const variantStyles = {
  default: "bg-nasun-c6/60 border-nasun-c5/30 backdrop-blur-md",
  featured: "bg-nasun-c6/70 border-nasun-c4/40 backdrop-blur-lg",
  preview: "bg-nasun-c6/40 border-nasun-c5/20 backdrop-blur-sm",
};

const hoverStyles = {
  default: "hover:-translate-y-1 hover:shadow-xl hover:border-nasun-c5/60",
  featured: "hover:-translate-y-2 hover:shadow-2xl hover:border-nasun-c4/70",
  preview: "hover:shadow-lg",
};

/**
 * GlassCard - Glassmorphism style card component
 *
 * A reusable card with frosted glass effect, used for modern UI layouts.
 * Supports three variants and optional hover animations.
 *
 * @example
 * <GlassCard variant="default" hoverEffect>
 *   <h3>Title</h3>
 *   <p>Content</p>
 * </GlassCard>
 */
export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = "",
  variant = "default",
  hoverEffect = true,
}) => {
  return (
    <div
      className={cn(
        // Base styles
        "rounded-2xl border p-5 md:p-6 lg:p-8",
        "shadow-lg",
        "transition-all duration-300 ease-out",
        "flex flex-col",
        // Variant styles
        variantStyles[variant],
        // Hover styles (conditional)
        hoverEffect && hoverStyles[variant],
        // Custom className
        className
      )}
    >
      {children}
    </div>
  );
};

export default GlassCard;
