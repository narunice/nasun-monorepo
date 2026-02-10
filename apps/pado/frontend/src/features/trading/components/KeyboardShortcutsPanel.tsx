/**
 * KeyboardShortcutsPanel
 * Full-screen overlay showing all keyboard shortcuts (Pro mode).
 * Toggled by ? key or clicking the shortcut help button.
 */

interface KeyboardShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    title: 'Side',
    shortcuts: [
      { key: 'B', description: 'Buy' },
      { key: 'S', description: 'Sell' },
    ],
  },
  {
    title: 'Order Mode',
    shortcuts: [
      { key: 'L', description: 'Limit' },
      { key: 'M', description: 'Market' },
      { key: 'C', description: 'Scale' },
    ],
  },
  {
    title: 'Amount',
    shortcuts: [
      { key: '1-9', description: '10%-90% of balance' },
      { key: '0', description: '100% of balance' },
    ],
  },
  {
    title: 'Price',
    shortcuts: [
      { key: '+ / =', description: 'Price tick up' },
      { key: '-', description: 'Price tick down' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { key: 'Enter', description: 'Submit order' },
      { key: 'T', description: 'Toggle Book/Trades' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { key: '[', description: 'Previous market' },
      { key: ']', description: 'Next market' },
      { key: '?', description: 'Toggle this panel' },
      { key: 'Esc', description: 'Close panel / modal' },
    ],
  },
];

export function KeyboardShortcutsPanel({ isOpen, onClose }: KeyboardShortcutsPanelProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-theme-bg-secondary border border-theme-border rounded-xl p-5 shadow-2xl w-[400px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-theme-text-primary">Keyboard Shortcuts</h3>
          <button
            onClick={onClose}
            className="text-theme-text-muted hover:text-theme-text-primary transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wider mb-1.5">
                {group.title}
              </div>
              <div className="space-y-1">
                {group.shortcuts.map(({ key, description }) => (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <kbd className="px-1.5 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-primary font-mono text-[11px] min-w-[32px] text-center shrink-0">
                      {key}
                    </kbd>
                    <span className="text-theme-text-muted">{description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-theme-text-muted mt-4 text-center">
          Shortcuts are active in Pro mode when no input field is focused
        </p>
      </div>
    </div>
  );
}
