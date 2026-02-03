import React from 'react';

export type CardVariant = 'default' | 'c4' | 'c5' | 'c6' | 'gradient';

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-muted/20 text-foreground border-border',
  c4: 'bg-ne1/5 border-ne1/30 text-foreground',
  c5: 'bg-ne1/10 border-ne1/50 text-foreground',
  c6: 'bg-card border-border text-foreground',
  gradient: 'bg-gradient-to-r from-ne1 to-ne2/40 border-ne1/20 text-ne5',
};

export interface CardProps {
  variant?: CardVariant;
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

/**
 * Card Component
 *
 * Container for grouped content with consistent nasun styling.
 *
 * @example
 * <Card variant="c4" hover>
 *   <h3>Card Title</h3>
 *   <p>Card content</p>
 * </Card>
 */
export function Card({
  variant = 'default',
  children,
  className = '',
  hover = false,
}: CardProps) {
  const variantStyle = variantStyles[variant];
  const hoverStyle = hover
    ? 'hover:shadow-md hover:border-ne2/40 transition-all duration-200'
    : '';

  return (
    <div
      className={`
        rounded-sm
        border
        backdrop-blur-sm
        ${variantStyle}
        ${hoverStyle}
        ${className}
      `.trim()}
    >
      {children}
    </div>
  );
}

export default Card;
