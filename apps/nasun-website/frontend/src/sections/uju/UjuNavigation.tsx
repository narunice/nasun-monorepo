const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'activity',  label: 'Activity' },
  { id: 'profile',   label: 'Profile' },
] as const;

type TabId = typeof TABS[number]['id'];

interface UjuNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function UjuNavigation({ activeTab, onTabChange }: UjuNavigationProps) {
  return (
    <>
      {/* Desktop: sticky top bar below Navbar */}
      <nav className="hidden md:block sticky top-[50px] z-40 bg-uju-card border-b border-uju-border">
        <div className="max-w-5xl mx-auto px-4 flex gap-1 h-[49px]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === t.id
                  ? 'border-pado-3 text-pado-3'
                  : 'border-transparent text-uju-secondary hover:text-uju-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Mobile: fixed bottom bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-uju-card border-t border-uju-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === t.id ? 'text-pado-3' : 'text-uju-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Mobile bottom bar spacer */}
      <div className="md:hidden h-16" />
    </>
  );
}
