/**
 * ShortcutHelpTooltip
 * Hoverable keyboard shortcut help indicator (Pro mode only).
 * CSS-only tooltip, no external dependencies.
 */

const SHORTCUTS = [
  { key: 'B', description: 'Buy side' },
  { key: 'S', description: 'Sell side' },
  { key: 'L', description: 'Limit order' },
  { key: 'M', description: 'Market order' },
  { key: 'Esc', description: 'Close modal' },
] as const;

export function ShortcutHelpTooltip() {
  return (
    <div className="relative group inline-block">
      <button
        className="w-5 h-5 rounded-full bg-theme-bg-tertiary text-theme-text-muted
          hover:text-theme-text-secondary hover:bg-theme-bg-secondary
          flex items-center justify-center text-[10px] font-medium transition-colors"
        aria-label="Keyboard shortcuts"
      >
        ?
      </button>

      {/* Tooltip (bottom-right anchor, opens upward) */}
      <div
        className="absolute bottom-full right-0 mb-2 w-44 p-2.5 rounded-lg
          bg-theme-bg-secondary border border-theme-border shadow-lg
          opacity-0 invisible group-hover:opacity-100 group-hover:visible
          transition-all duration-150 z-50"
      >
        <div className="text-[10px] font-semibold text-theme-text-secondary mb-1.5 flex items-center gap-1">
          <span className="text-xs">&#9000;</span> Keyboard Shortcuts
        </div>
        <div className="space-y-1">
          {SHORTCUTS.map(({ key, description }) => (
            <div key={key} className="flex items-center justify-between text-[10px]">
              <kbd className="px-1.5 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-primary font-mono text-[10px] min-w-[28px] text-center">
                {key}
              </kbd>
              <span className="text-theme-text-muted">{description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
