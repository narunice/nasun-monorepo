import { Link } from 'react-router-dom';
import { useNotificationStore, type UjuNotification, type NotificationType } from '../notifications/notificationStore';
import { UjuCard } from '../shared/UjuCard';

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const TYPE_BADGE: Record<NotificationType, { bg: string; text: string; label: string }> = {
  mission:    { bg: 'bg-pado-4/10',     text: 'text-pado-4',    label: 'Mission' },
  governance: { bg: 'bg-nasun-c1/10',   text: 'text-nasun-c1',  label: 'Governance' },
};

function NotificationRow({ notif }: { notif: UjuNotification }) {
  const markRead = useNotificationStore((s) => s.markRead);
  const dismiss = useNotificationStore((s) => s.dismiss);
  const badge = TYPE_BADGE[notif.type];

  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b border-uju-border last:border-0 ${notif.read ? '' : 'bg-white/[0.02]'}`}>
      {/* Unread dot */}
      <div className="shrink-0 mt-1.5 w-2 h-2">
        {!notif.read && <span className="block w-2 h-2 rounded-full bg-pado-3" aria-label="Unread" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-sm font-medium px-2 py-0.5 rounded-md ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
          <span className="text-sm text-uju-secondary">{formatRelativeTime(notif.timestamp)}</span>
        </div>
        <p className={`text-sm font-medium ${notif.read ? 'text-uju-secondary' : 'text-uju-primary'}`}>
          {notif.title}
        </p>
        <p className="text-sm text-uju-secondary mt-0.5">{notif.body}</p>
        {notif.actionUrl && (
          <Link
            to={notif.actionUrl}
            onClick={() => markRead(notif.id)}
            className="inline-flex items-center gap-1 mt-1.5 text-sm text-pado-3 hover:underline"
          >
            Go Vote
            <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={() => dismiss(notif.id)}
        className="shrink-0 text-uju-secondary hover:text-uju-primary transition-colors"
        aria-label="Dismiss notification"
      >
        <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function NotificationsPanel() {
  const notifications = useNotificationStore((s) => s.notifications);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clearAll = useNotificationStore((s) => s.clearAll);

  return (
    <UjuCard className="p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-uju-border">
        <p className="text-sm font-semibold text-uju-primary">Notifications</p>
        {notifications.length > 0 && (
          <button
            onClick={markAllRead}
            className="text-sm text-uju-secondary hover:text-pado-3 transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
          <svg aria-hidden="true" className="w-8 h-8 text-uju-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <p className="text-sm font-medium text-uju-secondary">No notifications yet.</p>
          <p className="text-sm text-uju-secondary">
            Complete missions and participate in governance to earn rewards.
          </p>
        </div>
      ) : (
        <>
          <div>
            {notifications.map((notif) => (
              <NotificationRow key={notif.id} notif={notif} />
            ))}
          </div>
          <div className="px-4 py-3 border-t border-uju-border">
            <button
              onClick={clearAll}
              className="text-sm text-uju-secondary hover:text-uju-primary transition-colors"
            >
              Clear all
            </button>
          </div>
        </>
      )}
    </UjuCard>
  );
}
