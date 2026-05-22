/**
 * NewChatButton — full-width sidebar button that opens an empty session.
 */

interface NewChatButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function NewChatButton({ onClick, disabled }: NewChatButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-dashed border-uju-border/60 text-sm text-uju-secondary hover:text-white hover:border-pado-2/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      New chat
    </button>
  );
}
