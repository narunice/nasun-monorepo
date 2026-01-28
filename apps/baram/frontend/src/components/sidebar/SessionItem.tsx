/**
 * SessionItem - Individual session in the sidebar list
 */

import { useState } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { ChatSession } from '../../types/chat';

interface SessionItemProps {
  session: ChatSession;
}

export function SessionItem({ session }: SessionItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const switchSession = useChatStore((state) => state.switchSession);
  const deleteSession = useChatStore((state) => state.deleteSession);

  const isActive = activeSessionId === session.id;

  const handleClick = () => {
    if (!isActive) {
      switchSession(session.id);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession(session.id);
    setShowMenu(false);
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setShowMenu(true)}
      onMouseLeave={() => setShowMenu(false)}
      className={`
        group relative flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer
        transition-colors text-sm
        ${isActive
          ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]'
        }
      `}
    >
      {/* Chat icon */}
      <svg className="w-4 h-4 flex-shrink-0 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>

      {/* Title */}
      <span className="flex-1 truncate">{session.title}</span>

      {/* Delete button (visible on hover) */}
      {showMenu && (
        <button
          onClick={handleDelete}
          className="p-1 rounded hover:bg-[var(--color-error)]/20 transition-colors"
          title="Delete chat"
        >
          <svg className="w-3.5 h-3.5 text-[var(--color-text-muted)] hover:text-[var(--color-error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}
