import React from 'react';

export type SectionColor = 'c3' | 'c4' | 'c5' | 'c6';

const colorStyles: Record<SectionColor, { border: string; bg: string; text: string; divider: string }> = {
  c3: {
    border: 'border-nasun-c3/50',
    bg: 'bg-nasun-c3/10',
    text: 'text-nasun-c3',
    divider: 'border-nasun-c3/30',
  },
  c4: {
    border: 'border-nasun-c4/50',
    bg: 'bg-nasun-c4/10',
    text: 'text-nasun-c4',
    divider: 'border-nasun-c4/30',
  },
  c5: {
    border: 'border-nasun-c5/50',
    bg: 'bg-nasun-c5/10',
    text: 'text-nasun-c5',
    divider: 'border-nasun-c5/30',
  },
  c6: {
    border: 'border-nasun-c5/30',
    bg: 'bg-nasun-c6/80',
    text: 'text-nasun-white',
    divider: 'border-nasun-c5/20',
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
            {rightTitle && <div className="text-sm text-slate-400">{rightTitle}</div>}
          </div>
          <hr className={`border-t ${styles.divider} mb-4`} />
        </>
      )}
      {children}
    </section>
  );
}

export default SectionBox;
