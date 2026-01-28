/**
 * SuggestionCard - Clickable prompt suggestion
 */

interface SuggestionCardProps {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
}

export function SuggestionCard({ icon, title, description, onClick }: SuggestionCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full p-4 text-left bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl hover:border-baram-1/50 hover:bg-[var(--color-bg-tertiary)] transition-all group"
    >
      <div className="flex items-start gap-3">
        <span className="text-lg">{icon}</span>
        <div>
          <div className="font-medium text-sm text-[var(--color-text-primary)] group-hover:text-baram-1 transition-colors">
            {title}
          </div>
          <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {description}
          </div>
        </div>
      </div>
    </button>
  );
}
