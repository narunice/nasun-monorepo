import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { UjuLayout } from "../../sections/uju/UjuLayout";
import { UjuNavigation } from "../../sections/uju/UjuNavigation";
import { DashboardTab } from "../../sections/uju/dashboard/DashboardTab";
import { ActivityTab } from "../../sections/uju/activity/ActivityTab";
import { ProfileTab } from "../../sections/uju/profile/ProfileTab";
import { UjuChatSidebar } from "../../sections/uju/chat/UjuChatSidebar";
import { BannerCarousel } from "../../sections/uju/dashboard/banner/BannerCarousel";

type Tab = "dashboard" | "activity" | "profile";
const VALID_TABS = new Set<Tab>(["dashboard", "activity", "profile"]);

function parseTab(raw: string | null): Tab {
  return raw && VALID_TABS.has(raw as Tab) ? (raw as Tab) : "dashboard";
}

export default function UjuPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const setTab = (t: Tab) => setSearchParams({ tab: t }, { replace: true });

  // JS-based breakpoint to prevent double-mount of UjuChatSidebar
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  return (
    <UjuLayout>
      <div className={isDesktop ? "flex h-[calc(100vh-50px)] overflow-hidden" : "flex min-h-[calc(100vh-50px)]"}>
        {/* Main content */}
        <main className={`flex-1 min-w-0${isDesktop ? " overflow-y-auto" : ""}`}>
          <div className="max-w-5xl mx-auto px-4 py-6">
            <div className="mb-5">
              <BannerCarousel />
            </div>
            <UjuNavigation activeTab={tab} onTabChange={setTab} />
            {tab === "dashboard" && <DashboardTab />}
            {tab === "activity" && <ActivityTab />}
            {tab === "profile" && <ProfileTab />}
          </div>
        </main>

        {/* Desktop sidebar: JS-conditional to prevent double-mount */}
        {isDesktop && (
          <aside className="flex flex-col w-80 shrink-0 border-l border-uju-border">
            <UjuChatSidebar />
          </aside>
        )}
      </div>

      {/* Mobile: only rendered when !isDesktop to prevent double-mount */}
      {!isDesktop && (
        <>
          <button
            onClick={() => setMobileChatOpen(true)}
            className="fixed bottom-20 right-4 z-40 w-10 h-10 bg-uju-card border border-uju-border rounded-full flex items-center justify-center text-uju-secondary hover:text-pado-3 shadow-lg"
            aria-label="Open chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          {mobileChatOpen && (
            <div className="fixed inset-0 z-[55] bg-uju-bg flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-uju-border shrink-0">
                <span className="text-sm font-medium text-uju-primary">Community Chat</span>
                <button
                  onClick={() => setMobileChatOpen(false)}
                  className="text-uju-secondary hover:text-uju-primary"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <UjuChatSidebar />
              </div>
            </div>
          )}
        </>
      )}
    </UjuLayout>
  );
}
