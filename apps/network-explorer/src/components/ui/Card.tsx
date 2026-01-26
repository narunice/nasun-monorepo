import React from 'react';

export type CardVariant = 'default' | 'c4' | 'c5' | 'c6' | 'gradient';

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-nasun-gray/5 dark:bg-nasun-gray/30 text-foreground border-nasun-c5/30',
  c4: 'bg-nasun-c4/5 border-nasun-c4/30 text-foreground',
  c5: 'bg-nasun-c5/10 border-nasun-c5/50 text-foreground',
  c6: 'bg-nasun-c6/80 border-nasun-c5/30 text-nasun-white',
  gradient: 'bg-gradient-to-r from-nasun-c6 to-nasun-c5/40 border-nasun-c4/20 text-nasun-white',
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
    ? 'hover:shadow-md hover:border-nasun-c4/40 transition-all duration-200'
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
