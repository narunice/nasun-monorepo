import { useNotificationStore } from "./notifications/notificationStore";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: DashboardIcon },
  { id: "activity",  label: "Activity",  icon: ActivityIcon },
  { id: "profile",   label: "Profile",   icon: ProfileIcon },
] as const;

type TabId = typeof TABS[number]["id"];

interface UjuNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function UjuNavigation({ activeTab, onTabChange }: UjuNavigationProps) {
  const hasUnread = useNotificationStore((s) => s.notifications.some((n) => !n.read));

  return (
    <>
      {/* Desktop: pill-style centered tabs (placed inline under the banner) */}
      <nav
        className="hidden md:flex justify-center mb-5"
        aria-label="uju sections"
      >
        <div className="inline-flex gap-1 p-1 rounded-full bg-uju-card border border-uju-border shadow-sm">
          {TABS.map((t) => {
            const isActive = activeTab === t.id;
            const showDot = t.id === "profile" && hasUnread;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                aria-current={isActive ? "page" : undefined}
                className={`relative px-5 py-2 text-sm font-semibold rounded-full transition-colors min-h-[40px] ${
                  isActive
                    ? "bg-gradient-to-r from-pado-2 to-pado-4 text-uju-bg"
                    : "text-uju-secondary hover:text-white"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {t.label}
                  {showDot && (
                    <span
                      className="w-2 h-2 rounded-full bg-nasun-coral shrink-0"
                      aria-label="Unread notifications"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile: fixed bottom tab bar with icons + labels for clear targets */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-uju-card/95 backdrop-blur border-t border-uju-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="uju sections"
      >
        <div className="flex">
          {TABS.map((t) => {
            const isActive = activeTab === t.id;
            const Icon = t.icon;
            const showDot = t.id === "profile" && hasUnread;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex-1 py-2.5 min-h-[56px] flex flex-col items-center justify-center gap-1 text-sm font-medium transition-colors ${
                  isActive ? "text-pado-2" : "text-uju-secondary"
                }`}
              >
                <span className="relative">
                  <Icon active={isActive} />
                  {showDot && (
                    <span
                      className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-nasun-coral"
                      aria-label="Unread notifications"
                    />
                  )}
                </span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile bottom bar spacer */}
      <div className="md:hidden h-[64px]" aria-hidden="true" />
    </>
  );
}

interface IconProps { active: boolean }

function DashboardIcon({ active }: IconProps) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function ActivityIcon({ active }: IconProps) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </svg>
  );
}

function ProfileIcon({ active }: IconProps) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0 1 14 0v1" />
    </svg>
  );
}
