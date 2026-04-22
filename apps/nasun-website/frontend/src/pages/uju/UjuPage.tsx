import { useSearchParams } from 'react-router-dom';
import { UjuLayout } from '../../sections/uju/UjuLayout';
import { UjuNavigation } from '../../sections/uju/UjuNavigation';
import { DashboardTab } from '../../sections/uju/dashboard/DashboardTab';
import { ActivityTab } from '../../sections/uju/activity/ActivityTab';
import { ProfileTab } from '../../sections/uju/profile/ProfileTab';

type Tab = 'dashboard' | 'activity' | 'profile';

const VALID_TABS = new Set<Tab>(['dashboard', 'activity', 'profile']);

function parseTab(raw: string | null): Tab {
  if (raw && VALID_TABS.has(raw as Tab)) return raw as Tab;
  return 'dashboard';
}

export default function UjuPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));

  const setTab = (t: Tab) => setSearchParams({ tab: t }, { replace: true });

  return (
    <UjuLayout>
      <UjuNavigation activeTab={tab} onTabChange={setTab} />
      <div className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'activity'  && <ActivityTab />}
        {tab === 'profile'   && <ProfileTab />}
      </div>
    </UjuLayout>
  );
}
