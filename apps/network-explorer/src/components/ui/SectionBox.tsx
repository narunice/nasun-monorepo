import React from 'react';

export type SectionColor = 'c3' | 'c4' | 'c5' | 'c6';

const colorStyles: Record<SectionColor, { border: string; bg: string; text: string; divider: string }> = {
  c3: {
    border: 'border-foreground/20',
    bg: 'bg-muted/40',
    text: 'text-foreground/80',
    divider: 'border-foreground/10',
  },
  c4: {
    border: 'border-ne1/40',
    bg: 'bg-ne1/5',
    text: 'text-primary',
    divider: 'border-ne1/20',
  },
  c5: {
    border: 'border-ne1/50',
    bg: 'bg-ne1/10',
    text: 'text-primary',
    divider: 'border-ne1/30',
  },
  c6: {
    border: 'border-foreground/20',
    bg: 'bg-muted/60',
    text: 'text-foreground',
    divider: 'border-foreground/20',
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
        rounded-sm
        border
        backdrop-blur-sm
        ${styles.border}
        ${styles.bg}
        ${className}
      `.trim()}
    >
      {title && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-lg font-semibold tracking-wide ${styles.text}`}>{title}</h2>
            {rightTitle && <div className="text-sm text-muted-foreground">{rightTitle}</div>}
          </div>
          <hr className={`border-t ${styles.divider} mb-6`} />
        </>
      )}
      {children}
    </section>
  );
}

export default SectionBox;
