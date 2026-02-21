export type BadgeVariant =
  | 'default'
  | 'success'
  | 'error'
  | 'info'
  | 'shared'
  | 'immutable'
  | 'child'
  | 'created'
  | 'mutated'
  | 'deleted'
  | 'wrapped'
  | 'published';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default:   'bg-muted text-muted-foreground border-border/40',
  success:   'bg-green-500/10 text-green-400 border-green-500/20',
  error:     'bg-destructive/10 text-destructive border-destructive/20',
  info:      'bg-primary/20 text-primary border-primary/20',
  shared:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
  immutable: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  child:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
  // Object change types — mapped to semantic variants
  created:   'bg-green-500/10 text-green-400 border-green-500/20',
  mutated:   'bg-primary/20 text-primary border-primary/20',
  deleted:   'bg-destructive/10 text-destructive border-destructive/20',
  wrapped:   'bg-muted text-muted-foreground border-border/40',
  published: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium uppercase tracking-wider border ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
