/**
 * Pill-style tab navigation for wallet connected state
 * Tabs: Assets / History / Account
 */

export type TabMode = "assets" | "history" | "account";

const TAB_CONFIG: Record<TabMode, { path: string; label: string }> = {
  assets: {
    path: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
    label: "Assets",
  },
  history: { path: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", label: "History" },
  account: {
    path: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    label: "Account",
  },
};

export function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabMode;
  onTabChange: (tab: TabMode) => void;
}) {
  return (
    <div className="flex gap-1 px-2 pt-2" role="tablist">
      {(Object.keys(TAB_CONFIG) as TabMode[]).map((tab) => {
        const isActive = tab === activeTab;
        const { path, label } = TAB_CONFIG[tab];
        return (
          <button
            key={tab}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab}`}
            onClick={() => onTabChange(tab)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs xl:text-sm font-medium transition-all ${
              isActive
                ? "bg-white dark:bg-zinc-800 rounded-t-lg text-blue-600 dark:text-blue-400"
                : "text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 rounded-t-lg"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
            </svg>
            {label}
          </button>
        );
      })}
    </div>
  );
}
