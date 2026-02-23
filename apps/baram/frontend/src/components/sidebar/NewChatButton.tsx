/**
 * NewChatButton - Button to create a new chat session
 */

import { useChatStore } from '../../stores/chatStore';

export function NewChatButton() {
  const createSession = useChatStore((state) => state.createSession);

  const handleNewChat = () => {
    createSession();
  };

  return (
    <button
      onClick={handleNewChat}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg
                 border border-[var(--color-border)] border-dashed
                 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]
                 hover:bg-[var(--color-bg-tertiary)] hover:border-solid
                 transition-all text-sm"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      <span>New Chat</span>
    </button>
  );
}
