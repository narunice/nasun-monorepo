/**
 * PortfolioPage
 * Tabbed dashboard combining analytics (Overview / Performance / Activity)
 * and fund management (Balance).
 */

import { useSearchParams } from "react-router-dom";
import {
  AssetOverview,
  AllocationDonut,
  PnlChart,
  TokenBalanceList,
  TradeStats,
  MarketPerformance,
  ActivityTabs,
} from "../features/portfolio/components";
import {
  MarginAccountCard,
  AdvancedFundLocation,
  WalletSection,
} from "../features/core/unified-margin";
import { BalancePasswordGate } from "../components/common/BalancePasswordGate";

type TabId = "overview" | "performance" | "activity" | "balance";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "activity", label: "Activity" },
  { id: "balance", label: "Pado Balance" },
];

const VALID_TABS = new Set<TabId>(TABS.map((t) => t.id));

function isTabId(value: string | null): value is TabId {
  return value !== null && VALID_TABS.has(value as TabId);
}

export function PortfolioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTabParam = searchParams.get("tab");
  // Redirect legacy ?tab=pocket URLs to the canonical ?tab=balance.
  const tabParam = rawTabParam === "pocket" ? "balance" : rawTabParam;
  const activeTab: TabId = isTabId(tabParam) ? tabParam : "overview";

  const setActiveTab = (id: TabId) => {
    const next = new URLSearchParams(searchParams);
    if (id === "overview") next.delete("tab");
    else next.set("tab", id);
    setSearchParams(next, { replace: false });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <span className="text-xs font-bold tracking-wider text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-400/10 border border-yellow-300 dark:border-yellow-400/30 px-2 py-0.5 rounded">
          FEATURE PREVIEW
        </span>
      </div>

      {/* Top-level tab nav */}
      <div className="flex gap-1.5 sm:gap-2 border-b border-theme-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-pd2 text-theme-text-primary"
                : "border-transparent text-theme-text-secondary hover:text-theme-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AssetOverview />
            <AllocationDonut />
          </div>
          <TokenBalanceList />
        </>
      )}

      {activeTab === "performance" && (
        <>
          <PnlChart />
          <TradeStats />
          <MarketPerformance />
        </>
      )}

      {activeTab === "activity" && <ActivityTabs />}

      {activeTab === "balance" && (
        <BalancePasswordGate>
          <BalanceTab />
        </BalancePasswordGate>
      )}
    </div>
  );
}

function BalanceTab() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-theme-text-primary">
          Pado Balance
        </h2>
        <p className="text-sm text-theme-text-secondary mt-1">
          Funds you've deposited to Pado for trading, plus what's still in your
          Nasun wallet.
        </p>
      </div>

      {/* Hero: Pado deposit balance, composition, actions, period activity */}
      <MarginAccountCard />

      {/* Self-custody reminder */}
      <p className="text-sm text-theme-text-secondary leading-relaxed px-1">
        Depositing to Pado never moves your funds outside your wallet. When you
        click "Enable Pado", a dedicated pocket is created inside your Nasun
        wallet for using Pado. Depositing simply shifts funds between your
        spendable Nasun wallet balance and your Pado balance, which is reserved
        for trading and lending. Both pockets stay under your own keys. You can
        move funds back to spendable anytime, either from Pado or from any Nasun
        app via "Recover funds" menu in your wallet.
      </p>

      {/* Advanced: where funds live (collapsed by default) */}
      <AdvancedFundLocation />

      <div className="border-t border-theme-border" />

      {/* Wallet section: holdings, send/receive/history/security, recovery */}
      <WalletSection />
    </div>
  );
}
