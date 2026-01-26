import React from 'react';

export type SectionColor = 'c3' | 'c4' | 'c5' | 'c6';

const colorStyles: Record<SectionColor, { border: string; bg: string; text: string; divider: string }> = {
  c3: {
    border: 'border-nasun-white/20',
    bg: 'bg-nasun-gray/40',
    text: 'text-nasun-white/80',
    divider: 'border-nasun-white/10',
  },
  c4: {
    border: 'border-nasun-c4/40',
    bg: 'bg-nasun-c4/5',
    text: 'text-nasun-c4',
    divider: 'border-nasun-c4/20',
  },
  c5: {
    border: 'border-nasun-c5/50',
    bg: 'bg-nasun-c5/10',
    text: 'text-nasun-c5',
    divider: 'border-nasun-c5/30',
  },
  c6: {
    border: 'border-nasun-white/20',
    bg: 'bg-nasun-gray/60',
    text: 'text-nasun-white',
    divider: 'border-nasun-white/20',
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
            {rightTitle && <div className="text-sm text-nasun-white/60">{rightTitle}</div>}
          </div>
          <hr className={`border-t ${styles.divider} mb-6`} />
        </>
      )}
      {children}
    </section>
  );
}

export default SectionBox;
