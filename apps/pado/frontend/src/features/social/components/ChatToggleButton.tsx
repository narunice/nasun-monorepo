interface Props {
  onClick: () => void;
}

export function ChatToggleButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="w-10 h-full bg-theme-bg-secondary rounded-lg border border-theme-border
        flex items-center justify-center
        text-theme-text-muted hover:text-theme-text-primary
        transition-colors"
      title="Open chat"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
