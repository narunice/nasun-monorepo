/**
 * ChatPage - Chat interface integrated into DashboardLayout
 *
 * Session management (history, new chat, clear) is handled by
 * the DashboardSidebar's Chat tab. This page only renders the
 * ChatTopBar, messages, and input area.
 */

import { useEffect } from "react";
import { ChatTopBar } from "../components/chat/ChatTopBar";
import { ChatInput } from "../components/input/ChatInput";
import { WelcomeScreen } from "../components/empty/WelcomeScreen";
import { LandingScreen } from "../components/empty/LandingScreen";
import { NFTGateScreen } from "../components/empty/NFTGateScreen";
import { OnboardingChecklist } from "../components/empty/OnboardingChecklist";
import { MessageList } from "../components/chat/MessageList";
import { AttestationDisplay } from "../features/request/components/AttestationDisplay";
import { useWalletSession } from "../hooks/useWalletSession";
import { useNFTGate } from "../hooks/useNFTGate";
import { useRequestWithRetry } from "../features/request/hooks/useRequestWithRetry";
import { MODEL_PRICING, ModelId } from "../config/network";
import { useChatStore } from "../stores/chatStore";
import { useMultiBalance } from "@nasun/wallet";
import { ClaimAllButton } from "@nasun/wallet-ui";

export function ChatPage() {
  const { isConnected, walletAddress } = useWalletSession();
  const {
    hasAccess,
    isLoading: nftLoading,
    refresh: refreshNFTGate,
  } = useNFTGate(walletAddress);
  const {
    submit,
    isProcessing,
    selectedExecutor,
    requestStatus,
    result,
    executorsLoading,
    executorsError,
    attestation,
  } = useRequestWithRetry();

  const { data: balances } = useMultiBalance();
  const nusdcBalance = balances?.tokens["NUSDC"]?.balance ?? 0n;
  const hasNusdc = nusdcBalance > 0n;

  const messages = useChatStore((state) => state.messages);
  const createSession = useChatStore((state) => state.createSession);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const privacyMode = useChatStore((state) => state.privacyMode);
  const setPrivacyMode = useChatStore((state) => state.setPrivacyMode);
  const isLoading = useChatStore((state) => state.isLoading);
  const currentWalletAddress = useChatStore(
    (state) => state.currentWalletAddress,
  );

  useEffect(() => {
    if (!selectedModel) {
      setPrivacyMode(privacyMode);
    }
  }, [selectedModel, privacyMode, setPrivacyMode]);

  useEffect(() => {
    if (isConnected && currentWalletAddress && !activeSessionId && !isLoading) {
      createSession();
    }
  }, [
    isConnected,
    currentWalletAddress,
    activeSessionId,
    createSession,
    isLoading,
  ]);

  // Wrap submit to pre-check NUSDC balance
  const handleSubmit = (prompt: string) => {
    if (!hasNusdc) return; // Block submission when no NUSDC
    submit(prompt);
  };

  const hasMessages = messages.length > 0 || isProcessing;

  return (
    <div className="flex flex-col h-full pb-8">
      {/* Top bar: session title + model name */}
      <ChatTopBar />

      {/* Scrollable message area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {!isConnected ? (
            <LandingScreen />
          ) : nftLoading ? (
            <div className="flex items-center justify-center min-h-[60vh]">
              <span className="text-sm text-[var(--color-text-muted)]">
                Checking access...
              </span>
            </div>
          ) : !hasAccess ? (
            <NFTGateScreen
              walletAddress={walletAddress}
              onRefresh={refreshNFTGate}
            />
          ) : !hasMessages ? (
            <>
              <OnboardingChecklist hasTokens={hasNusdc} />
              <WelcomeScreen onSuggestionClick={handleSubmit} />
              {selectedExecutor &&
                MODEL_PRICING[selectedModel as ModelId]?.provider === "tee" && (
                  <div className="max-w-lg mx-auto mt-6">
                    <AttestationDisplay
                      teeType={selectedExecutor.teeType}
                      attestation={attestation}
                    />
                  </div>
                )}
            </>
          ) : (
            <>
              <MessageList
                messages={messages}
                isProcessing={isProcessing}
                isTeeExecutor={
                  (selectedExecutor?.teeType ?? 0) > 0 &&
                  MODEL_PRICING[selectedModel as ModelId]?.provider === "tee"
                }
                requestStatus={requestStatus}
              />
              {selectedExecutor && attestation.isVerified && (
                <div className="mt-4 text-center">
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--color-success)]">
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                    TEE Attestation Verified
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Fixed input area at bottom */}
      <div className="bg-[var(--color-bg-primary)] border-t border-[var(--color-border)]">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-2">
          {/* Faucet banner when connected but no NUSDC */}
          {isConnected && hasAccess && !hasNusdc && (
            <div className="flex items-center gap-3 p-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  Get test tokens to start
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  You need NUSDC to pay for AI inference. Claim free devnet
                  tokens below.
                </p>
              </div>
              <div className="shrink-0 w-40">
                <ClaimAllButton />
              </div>
            </div>
          )}
          <ChatInput
            onSubmit={handleSubmit}
            disabled={
              isProcessing ||
              !isConnected ||
              !selectedExecutor ||
              !hasAccess ||
              !hasNusdc
            }
            placeholder={
              !isConnected
                ? "Connect wallet to start..."
                : executorsLoading
                  ? "Loading executors..."
                  : executorsError
                    ? "Failed to load executors"
                    : !hasNusdc
                      ? "Claim test tokens above to get started..."
                      : !selectedExecutor
                        ? "No eligible executors available"
                        : "Ask anything..."
            }
            privacyMode={privacyMode}
            onTogglePrivacy={(mode) => setPrivacyMode(mode)}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
          />
          {(result?.requestId !== undefined ||
            result?.executionTimeMs !== undefined) && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] px-1">
              {result?.requestId !== undefined && (
                <span>Request #{result.requestId}</span>
              )}
              {result?.executionTimeMs !== undefined && (
                <span>{(result.executionTimeMs / 1000).toFixed(2)}s</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
