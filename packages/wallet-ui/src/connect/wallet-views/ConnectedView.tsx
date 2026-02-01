/**
 * Unified connected wallet view for both zkLogin and self-custody wallets.
 * Uses variant prop to handle the differences in header and session actions.
 */

import { type NFTInfo } from "@nasun/wallet";
import { CopyableAddress } from "../../address/CopyableAddress";
import { WalletLabelEditor } from "../WalletLabelEditor";
import { NFTDetail } from "../../nft/NFTDetail";
import { NetworkSelectorModal } from "../../network/NetworkSelectorModal";
import { TabBar, type TabMode } from "../TabBar";
import { QuickActionsBar } from "../QuickActionsBar";
import { MoreMenu } from "../MoreMenu";
import type { ViewMode } from "../LockedStateUI";
import { NetworkSelector } from "./NetworkSelector";
import { AssetsTabContent } from "./AssetsTabContent";
import { AccountTabContent } from "./AccountTabContent";
import { HistoryTabContent } from "./HistoryTabContent";

interface ZkLoginHeaderProps {
  variant: "zkLogin";
  zkUserInfo: { name?: string; email?: string; picture?: string; provider?: string } | null;
  zkAddress: string;
}

interface SelfCustodyHeaderProps {
  variant: "self-custody";
  accountAddress: string;
  displayAddress: string;
  addressLabel: string;
  isEVM: boolean;
  storedEVMAddress: string | null;
}

type HeaderProps = ZkLoginHeaderProps | SelfCustodyHeaderProps;

interface ConnectedViewProps {
  // Header variant
  header: HeaderProps;
  isMobile: boolean;

  // Network
  isAdvancedMode: boolean;
  chain: { name: string; type: string; nativeCurrency: { symbol: string } };
  isNetworkModalOpen: boolean;
  setIsNetworkModalOpen: (v: boolean) => void;

  // Tabs
  activeTab: TabMode;
  setActiveTab: (tab: TabMode) => void;

  // Assets tab data
  isEVM: boolean;
  storedEVMAddress: string | null;
  evmBalance: { display: string } | null | undefined;
  evmBalanceLoading: boolean;
  balances: { native?: { formatted: string }; tokens?: Record<string, { formatted: string }> } | undefined;
  balancesLoading: boolean;
  networkType: string;
  getAllTokens: () => { symbol: string }[];
  accumulatedNfts: NFTInfo[];
  nftsLoading: boolean;
  selectedNFT: NFTInfo | null;
  setSelectedNFT: (nft: NFTInfo | null) => void;

  // Account tab data
  nsaIsInitialized: boolean;
  nsaRecoveryCompleted: number;

  // Quick actions
  showMoreMenu: boolean;
  setShowMoreMenu: (v: boolean) => void;
  pendingForMe: number;

  // Navigation
  setViewMode: (mode: ViewMode) => void;
  setSendRecipient: (addr: string | undefined) => void;

  // Proposal banner (self-custody only)
  proposalBannerDismissed: boolean;
  setProposalBannerDismissed: (v: boolean) => void;
  nsaIncomingInvitations: { objectId: string }[];
  setSelectedProposalId: (id: string) => void;

  // Session actions
  onSignOut?: () => void;
  onLock?: () => void;
  onDelete?: () => void;
}

export function ConnectedView(props: ConnectedViewProps) {
  const {
    header,
    isMobile,
    isAdvancedMode,
    chain,
    isNetworkModalOpen,
    setIsNetworkModalOpen,
    activeTab,
    setActiveTab,
    isEVM,
    storedEVMAddress,
    evmBalance,
    evmBalanceLoading,
    balances,
    balancesLoading,
    networkType,
    getAllTokens,
    accumulatedNfts,
    nftsLoading,
    selectedNFT,
    setSelectedNFT,
    nsaIsInitialized,
    nsaRecoveryCompleted,
    showMoreMenu,
    setShowMoreMenu,
    pendingForMe,
    setViewMode,
    setSendRecipient,
    proposalBannerDismissed,
    setProposalBannerDismissed,
    nsaIncomingInvitations,
    setSelectedProposalId,
    onSignOut,
    onLock,
    onDelete,
  } = props;

  const variant = header.variant;

  const handleNavigate = (mode: ViewMode) => setViewMode(mode);

  return (
    <div className="w-full ">
      {/* Header */}
      <div className="px-3 py-3 bg-gray-100 dark:bg-zinc-700/50">
        <div className="flex items-start justify-between gap-2 mb-2">
          {/* Left: variant-specific header */}
          {header.variant === "zkLogin" ? (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {header.zkUserInfo?.picture ? (
                <img
                  src={header.zkUserInfo.picture}
                  alt={header.zkUserInfo.name || "User"}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium">
                  {header.zkUserInfo?.name?.[0] || "U"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm xl:text-base text-gray-900 dark:text-white font-medium truncate">
                  {header.zkUserInfo?.name || "Social Login"}
                </p>
                <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 truncate">
                  {header.zkUserInfo?.email || header.zkUserInfo?.provider || "Connected"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0 text-left">
              <WalletLabelEditor address={header.accountAddress} fallbackLabel={header.addressLabel} />
              {header.isEVM && !header.storedEVMAddress ? (
                <p className="text-xs xl:text-sm text-amber-600 dark:text-amber-400">
                  Re-import with your mnemonic to enable EVM support
                </p>
              ) : (
                <CopyableAddress
                  value={header.displayAddress}
                  shorten={isMobile ? 4 : 6}
                  showCopy
                  showExplorer
                  explorerType="address"
                  size="xs"
                />
              )}
            </div>
          )}

          {/* Right: Network selector */}
          <NetworkSelector
            isAdvancedMode={isAdvancedMode}
            chain={chain}
            onOpenModal={() => setIsNetworkModalOpen(true)}
          />
        </div>

        {/* Address for zkLogin (below profile info) */}
        {header.variant === "zkLogin" && (
          <CopyableAddress
            value={header.zkAddress}
            shorten={isMobile ? 4 : 6}
            showCopy
            showExplorer
            explorerType="address"
            size="xs"
          />
        )}
      </div>

      {/* Network selector modal */}
      {isNetworkModalOpen && (
        <NetworkSelectorModal onClose={() => setIsNetworkModalOpen(false)} />
      )}

      {/* Pending proposal notification banner (self-custody only) */}
      {variant === "self-custody" && pendingForMe > 0 && !proposalBannerDismissed && (
        <div className="mx-3 mt-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2">
          <svg
            className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <button
            onClick={() => {
              setProposalBannerDismissed(true);
              if (nsaIncomingInvitations.length > 0) {
                setSelectedProposalId(nsaIncomingInvitations[0].objectId);
                setViewMode("nsa-accept-proposal");
              } else {
                setViewMode("nsa-info");
              }
            }}
            className="flex-1 text-left text-xs xl:text-sm text-blue-800 dark:text-blue-300"
          >
            You have {pendingForMe} pending signer invitation{pendingForMe > 1 ? "s" : ""}. Tap
            to view.
          </button>
          <button
            onClick={() => setProposalBannerDismissed(true)}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Tab frame: gray background wraps tabs + content */}
      <div className="bg-gray-100 dark:bg-zinc-700/50 pb-1">
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Assets tab */}
        {activeTab === "assets" && (
          <AssetsTabContent
            isEVM={isEVM}
            chain={chain}
            storedEVMAddress={storedEVMAddress}
            evmBalance={evmBalance}
            evmBalanceLoading={evmBalanceLoading}
            balances={balances}
            balancesLoading={balancesLoading}
            networkType={networkType}
            getAllTokens={getAllTokens}
            accumulatedNfts={accumulatedNfts}
            nftsLoading={nftsLoading}
            onSelectNFT={(nft) => setSelectedNFT(nft)}
          />
        )}

        {/* Account tab */}
        {activeTab === "account" && (
          <AccountTabContent
            variant={variant}
            nsaIsInitialized={nsaIsInitialized}
            nsaRecoveryCompleted={nsaRecoveryCompleted}
            onNavigate={handleNavigate}
          />
        )}

        {/* History tab */}
        {activeTab === "history" && (
          <HistoryTabContent
            onNavigate={handleNavigate}
            setSendRecipient={setSendRecipient}
          />
        )}
      </div>
      {/* end tab frame */}

      {/* Quick Actions Bar */}
      <QuickActionsBar
        onAction={(action) => setViewMode(action as ViewMode)}
        showMoreMenu={showMoreMenu}
        onToggleMore={() => setShowMoreMenu(!showMoreMenu)}
        moreMenuContent={
          <MoreMenu
            nsaIsInitialized={nsaIsInitialized}
            nsaRecoveryCompleted={nsaRecoveryCompleted}
            pendingForMe={pendingForMe}
            onPortfolio={() => {
              setViewMode("portfolio");
              setShowMoreMenu(false);
            }}
            onCreateLink={() => {
              setViewMode("nasun-link");
              setShowMoreMenu(false);
            }}
            onSmartAccount={() => {
              setViewMode(nsaIsInitialized ? "nsa-info" : "nsa-setup");
              setShowMoreMenu(false);
            }}
          />
        }
      />

      {/* Session Actions - Always visible */}
      <div className="px-2 pb-2 pt-1 bg-gray-100 dark:bg-zinc-700/50">
        {variant === "zkLogin" && onSignOut ? (
          <button
            onClick={onSignOut}
            className="w-full px-3 py-2 text-sm xl:text-base text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-300 dark:hover:border-red-500/50 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Sign Out
          </button>
        ) : (
          <div className="flex gap-2">
            {onLock && (
              <button
                onClick={onLock}
                className="flex-1 px-3 py-2 text-sm xl:text-base text-gray-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                Lock
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="flex-1 px-3 py-2 text-sm xl:text-base text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-300 dark:hover:border-red-500/50 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Remove
              </button>
            )}
          </div>
        )}
      </div>

      {/* NFT Detail Modal */}
      {selectedNFT && (
        <NFTDetail
          nft={selectedNFT}
          onClose={() => setSelectedNFT(null)}
          onTransferSuccess={() => {
            setSelectedNFT(null);
          }}
        />
      )}
    </div>
  );
}
