import React from 'react';

export type CardVariant = 'default' | 'c3' | 'c4' | 'c5' | 'c6' | 'gradient';

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-nasun-c6/90 border-nasun-c5/50',
  c3: 'bg-nasun-c3/10 border-nasun-c3/50',
  c4: 'bg-nasun-c4/10 border-nasun-c4/50',
  c5: 'bg-nasun-c5/10 border-nasun-c5/50',
  c6: 'bg-nasun-c6/80 border-nasun-c5/30',
  gradient: 'bg-gradient-to-r from-nasun-c5/20 to-nasun-c4/40 border-nasun-c4/50',
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
    ? 'hover:shadow-xl hover:scale-[1.01] transition-all duration-200'
    : '';

  return (
    <div
      className={`
        rounded-xl
        border
        backdrop-blur-md
        shadow-lg
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
