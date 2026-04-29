import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { UjuLayout } from "../../sections/uju/UjuLayout";
import { UjuNavigation } from "../../sections/uju/UjuNavigation";
import { DashboardTab, DashboardNftsSection } from "../../sections/uju/dashboard/DashboardTab";
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

  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Default-open on desktop, default-closed on mobile.
  const [chatOpen, setChatOpen] = useState(isDesktop);
  useEffect(() => {
    setChatOpen(isDesktop);
  }, [isDesktop]);

  const showInlineChat = chatOpen && isDesktop && tab === "dashboard";
  const showMobileChat = chatOpen && !isDesktop;

  // Match chat panel bottom to Daily Missions card bottom.
  const chatRef = useRef<HTMLElement | null>(null);
  const [chatHeight, setChatHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!showInlineChat) return;

    const compute = () => {
      const anchor = document.querySelector<HTMLElement>(
        '[data-uju-anchor="daily-missions"]',
      );
      const aside = chatRef.current;
      if (!anchor || !aside) return;
      const aRect = anchor.getBoundingClientRect();
      const cRect = aside.getBoundingClientRect();
      const h = aRect.bottom - cRect.top;
      if (h > 200) setChatHeight(h);
    };

    compute();
    const ro = new ResizeObserver(compute);
    const anchor = document.querySelector('[data-uju-anchor="daily-missions"]');
    if (anchor) ro.observe(anchor);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [showInlineChat, tab]);

  return (
    <UjuLayout>
      <main className="min-h-[calc(100vh-50px)]">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* Banner — full container width */}
          <div className="mb-5">
            <BannerCarousel />
          </div>

          {/* Navigation — full container width, centered */}
          <UjuNavigation activeTab={tab} onTabChange={setTab} />

          {/* Main content + chat split (chat top = grid top = Health top) */}
          <div className={showInlineChat ? "flex gap-4 lg:gap-5 items-start" : ""}>
            <div className={showInlineChat ? "flex-1 min-w-0" : ""}>
              {tab === "dashboard" && <DashboardTab excludeNfts />}
              {tab === "activity" && <ActivityTab />}
              {tab === "profile" && <ProfileTab />}
            </div>

            {showInlineChat && (
              <aside
                ref={chatRef}
                className="shrink-0 bg-uju-card border border-uju-border rounded-2xl overflow-hidden shadow-xl flex flex-col"
                style={{
                  width: "320px",
                  height: chatHeight ? `${chatHeight}px` : "640px",
                }}
              >
                <UjuChatSidebar onClose={() => setChatOpen(false)} />
              </aside>
            )}
          </div>

          {/* NFTs Activated — full container width, below split */}
          {tab === "dashboard" && (
            <div className="mt-4 sm:mt-5">
              <DashboardNftsSection />
            </div>
          )}
        </div>
      </main>

      {/* Floating chat toggle button */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-uju-card border border-uju-border rounded-full flex items-center justify-center text-pado-3 hover:text-pado-4 shadow-xl hover:scale-105 transition-transform"
          aria-label="Open chat"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Mobile chat: full-screen overlay */}
      {showMobileChat && (
        <div className="fixed inset-0 z-[55] bg-uju-bg flex flex-col">
          <UjuChatSidebar onClose={() => setChatOpen(false)} />
        </div>
      )}
    </UjuLayout>
  );
}
