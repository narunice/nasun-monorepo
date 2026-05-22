/**
 * SessionItem — a single past-conversation row in the chat sidebar.
 * Click switches to the session; hover reveals a delete affordance so the
 * common "switch" action is one click while the destructive action stays
 * explicit.
 */

import { useState } from 'react';
import type { ChatSession } from '../../types/chat';

interface SessionItemProps {
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function SessionItem({ session, isActive, onSelect, onDelete }: SessionItemProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={`group flex items-center gap-1 rounded-md transition-colors ${
        isActive
          ? 'bg-uju-bg border border-pado-2/40'
          : 'hover:bg-uju-bg/60 border border-transparent'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          if (!isActive) onSelect();
        }}
        className="flex-1 min-w-0 text-left px-2 py-1.5"
      >
        <span
          className={`block text-sm truncate ${
            isActive ? 'text-white' : 'text-uju-secondary'
          }`}
          title={session.title}
        >
          {session.title}
        </span>
      </button>
      {confirming ? (
        <div className="flex items-center gap-1 pr-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
              onDelete();
            }}
            className="text-xs text-red-400 hover:text-red-300 px-1"
            title="Confirm delete"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirming(false);
            }}
            className="text-xs text-uju-secondary/70 hover:text-white px-1"
            title="Cancel"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          className="opacity-0 group-hover:opacity-100 text-uju-secondary/70 hover:text-red-400 transition-opacity p-1.5"
          title="Delete chat"
          aria-label="Delete chat"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
