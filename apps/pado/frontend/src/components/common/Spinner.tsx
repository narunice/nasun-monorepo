/**
 * Spinner Component
 * Loading indicator with customizable size
 */

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div
      className={`${sizeClasses[size]} border-2 border-theme-border border-t-blue-500 rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
