import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { UjuLayout } from "../../sections/uju/UjuLayout";
import { UjuNavigation } from "../../sections/uju/UjuNavigation";
import { DashboardTab, DashboardNftsSection } from "../../sections/uju/dashboard/DashboardTab";
import { ActivityTab } from "../../sections/uju/activity/ActivityTab";
import { ProfileTab } from "../../sections/uju/profile/ProfileTab";
import { UjuChatSidebar } from "../../sections/uju/chat/UjuChatSidebar";
import { BannerCarousel } from "../../sections/uju/dashboard/banner/BannerCarousel";
import { UjuAppDirectoryProvider } from "../../sections/uju/apps/UjuAppDirectoryProvider";
import { useAuth } from "@/features/auth";

type Tab = "dashboard" | "activity" | "profile";
const VALID_TABS = new Set<Tab>(["dashboard", "activity", "profile"]);

function parseTab(raw: string | null): Tab {
  return raw && VALID_TABS.has(raw as Tab) ? (raw as Tab) : "dashboard";
}

export default function UjuPage() {
  const { user } = useAuth();
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

  const inlineChatSlot = showInlineChat ? (
    <div className="h-full bg-gray-950/50 backdrop-blur-sm border border-uju-border/60 rounded-lg overflow-hidden shadow-[0_4px_24px_rgba(14,28,36,0.5)] flex flex-col">
      <UjuChatSidebar onClose={() => setChatOpen(false)} />
    </div>
  ) : null;

  return (
    <UjuAppDirectoryProvider identityId={user?.identityId}>
    <UjuLayout>
      <main className="min-h-[calc(100vh-50px)]">
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-12 max-md:pb-40">
          {/* Banner — full container width */}
          <div className="mb-5">
            <BannerCarousel />
          </div>

          {/* Navigation — full container width, centered */}
          <UjuNavigation activeTab={tab} onTabChange={setTab} />

          {/* Main content. The hero Overview card always renders full-width;
              the chat panel slots to the right of Daily Missions when open
              on desktop. */}
          <div>
            {tab === "dashboard" && <DashboardTab chatSlot={inlineChatSlot} />}
            {tab === "activity" && <ActivityTab />}
            {tab === "profile" && <ProfileTab />}
          </div>

          {/* NFTs Activated — full container width, below split */}
          {tab === "dashboard" && (
            <div id="nfts-activated" className="mt-4 sm:mt-5">
              <DashboardNftsSection />
            </div>
          )}
        </div>
      </main>

      {/* Floating chat toggle button */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-20 md:bottom-6 right-6 z-40 w-14 h-14 bg-uju-card border border-uju-border rounded-full flex items-center justify-center text-pado-3 hover:text-pado-4 shadow-xl hover:scale-105 transition-transform"
          aria-label="Open chat"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {/* Mobile chat: full-screen overlay */}
      {showMobileChat && (
        <div className="fixed inset-0 z-[65] bg-uju-bg flex flex-col pt-[50px]">
          <UjuChatSidebar onClose={() => setChatOpen(false)} />
        </div>
      )}

    </UjuLayout>
    </UjuAppDirectoryProvider>
  );
}
