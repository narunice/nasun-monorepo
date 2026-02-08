/**
 * SidebarSettings - Clear history button
 * Model selection moved to Privacy Mode toggle in ChatInput.
 */

import { useChatStore } from '../../stores/chatStore';

export function SidebarSettings() {
  const clearAllSessions = useChatStore((state) => state.clearAllSessions);

  const handleClearAll = async () => {
    if (window.confirm('Delete all chat history? This cannot be undone.')) {
      await clearAllSessions();
    }
  };

  return (
    <div className="p-3">
      <button
        onClick={handleClearAll}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg
                   text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]
                   hover:bg-[var(--color-error)]/10 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <span>Clear All History</span>
      </button>
    </div>
  );
}
