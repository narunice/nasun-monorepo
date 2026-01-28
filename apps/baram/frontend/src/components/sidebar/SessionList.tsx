/**
 * SessionList - Displays chat sessions grouped by date
 */

import { useChatStore } from '../../stores/chatStore';
import { groupSessionsByDate, DateGroup, ChatSession } from '../../types/chat';
import { SessionItem } from './SessionItem';

const GROUP_LABELS: Record<DateGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  previous7days: 'Previous 7 Days',
  older: 'Older',
};

export function SessionList() {
  const sessions = useChatStore((state) => state.sessions);
  const grouped = groupSessionsByDate(sessions);

  const hasAnySessions = sessions.length > 0;

  if (!hasAnySessions) {
    return (
      <div className="p-4 text-center">
        <p className="text-xs text-[var(--color-text-muted)]">
          No chat history yet
        </p>
      </div>
    );
  }

  return (
    <div className="px-2 py-1">
      {(Object.keys(grouped) as DateGroup[]).map((group) => {
        const groupSessions = grouped[group];
        if (groupSessions.length === 0) return null;

        return (
          <div key={group} className="mb-3">
            <h3 className="px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
              {GROUP_LABELS[group]}
            </h3>
            <div className="space-y-0.5">
              {groupSessions.map((session) => (
                <SessionItem key={session.id} session={session} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
