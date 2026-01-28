/**
 * SessionList - Displays chat sessions grouped by date
 *
 * Shows "Connect wallet to see history" when disconnected
 * to protect privacy of encrypted chat history.
 */

import { useWallet, useZkLogin, useLedger } from '@nasun/wallet';
import { useChatStore } from '../../stores/chatStore';
import { groupSessionsByDate, DateGroup } from '../../types/chat';
import { SessionItem } from './SessionItem';

const GROUP_LABELS: Record<DateGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  previous7days: 'Previous 7 Days',
  older: 'Older',
};

export function SessionList() {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const { isConnected: isLedgerConnected } = useLedger();
  const isConnected = (status === 'unlocked' && !!account) || isZkLoggedIn || isLedgerConnected;

  const sessions = useChatStore((state) => state.sessions);
  const isLoading = useChatStore((state) => state.isLoading);
  const grouped = groupSessionsByDate(sessions);

  const hasAnySessions = sessions.length > 0;

  // Show connect message when wallet is not connected
  if (!isConnected) {
    return (
      <div className="p-4 text-center">
        <svg
          className="w-8 h-8 mx-auto mb-2 text-[var(--color-text-muted)] opacity-50"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        <p className="text-xs text-[var(--color-text-muted)]">
          Connect wallet to see history
        </p>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <svg
          className="w-5 h-5 mx-auto mb-2 text-[var(--color-text-muted)] animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-xs text-[var(--color-text-muted)]">
          Loading history...
        </p>
      </div>
    );
  }

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
