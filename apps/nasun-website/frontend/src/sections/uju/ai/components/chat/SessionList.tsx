/**
 * SessionList — sidebar of past chat sessions for the active agent.
 * Sessions are ordered most-recent first (sorted in the store on load and
 * on every persist). No date grouping yet; flat scrollable list keeps the
 * sidebar narrow.
 */

import type { ChatSession } from '../../types/chat';
import { SessionItem } from './SessionItem';

interface SessionListProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isLoading: boolean;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

export function SessionList({
  sessions,
  activeSessionId,
  isLoading,
  onSelect,
  onDelete,
}: SessionListProps) {
  if (isLoading && sessions.length === 0) {
    return (
      <div className="px-3 py-6 text-sm text-uju-secondary/70 text-center">
        Loading history...
      </div>
    );
  }
  if (sessions.length === 0) {
    return (
      <div className="px-3 py-6 text-sm text-uju-secondary/70 text-center">
        No chat history yet.
      </div>
    );
  }
  return (
    <ul className="space-y-0.5 px-1.5">
      {sessions.map((s) => (
        <li key={s.id}>
          <SessionItem
            session={s}
            isActive={activeSessionId === s.id}
            onSelect={() => onSelect(s.id)}
            onDelete={() => onDelete(s.id)}
          />
        </li>
      ))}
    </ul>
  );
}
