/**
 * ChatTopBar - Compact top bar for the chat page
 *
 * Displays current session title and model name.
 * Self-contained: reads state directly from chatStore.
 */

import { useChatStore } from '../../stores/chatStore';
import { MODEL_PRICING, ModelId } from '../../config/network';

export function ChatTopBar() {
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const sessions = useChatStore((state) => state.sessions);
  const selectedModel = useChatStore((state) => state.selectedModel);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const sessionTitle = activeSession?.title || 'New Chat';
  const modelName = selectedModel
    ? MODEL_PRICING[selectedModel as ModelId]?.name
    : undefined;

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
      {/* Session title */}
      <span className="text-sm font-medium text-[var(--color-text-primary)] truncate flex-1">
        {sessionTitle}
      </span>

      {/* Model name */}
      {modelName && (
        <span className="text-xs text-[var(--color-text-muted)] px-2 py-0.5 rounded bg-[var(--color-bg-secondary)] shrink-0">
          {modelName}
        </span>
      )}
    </div>
  );
}
