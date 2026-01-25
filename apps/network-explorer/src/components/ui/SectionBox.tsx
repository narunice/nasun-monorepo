import React from 'react';

export type SectionColor = 'c3' | 'c4' | 'c5' | 'c6';

const colorStyles: Record<SectionColor, { border: string; bg: string; text: string; divider: string }> = {
  c3: {
    border: 'border-nasun-c3/50',
    bg: 'bg-nasun-c3/10',
    text: 'dark:text-nasun-c3 text-teal-600',
    divider: 'border-nasun-c3/30',
  },
  c4: {
    border: 'border-primary/50',
    bg: 'bg-primary/10',
    text: 'text-primary',
    divider: 'border-primary/30',
  },
  c5: {
    border: 'border-secondary/50',
    bg: 'bg-secondary/10',
    text: 'text-secondary',
    divider: 'border-secondary/30',
  },
  c6: {
    border: 'border-border',
    bg: 'bg-card',
    text: 'text-foreground',
    divider: 'border-border',
  },
};

export interface SectionBoxProps {
  title?: string;
  rightTitle?: React.ReactNode;
  color?: SectionColor;
  children: React.ReactNode;
  className?: string;
}

/**
 * SectionBox Component
 *
 * Section container with optional title and divider.
 * Based on nasun-website DividerBox pattern.
 *
 * @example
 * <SectionBox title="Transaction History" color="c4">
 *   {content}
 * </SectionBox>
 */
export function SectionBox({
  title,
  rightTitle,
  color = 'c6',
  children,
  className = '',
}: SectionBoxProps) {
  const styles = colorStyles[color];

  return (
    <section
      className={`
        p-4 md:p-6
        rounded-xl
        border
        backdrop-blur-md
        ${styles.border}
        ${styles.bg}
        ${className}
      `.trim()}
    >
      {title && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-lg font-semibold ${styles.text}`}>{title}</h2>
            {rightTitle && <div className="text-sm text-muted-foreground">{rightTitle}</div>}
          </div>
          <hr className={`border-t ${styles.divider} mb-4`} />
        </>
      )}
      {children}
    </section>
  );
}

export default SectionBox;
