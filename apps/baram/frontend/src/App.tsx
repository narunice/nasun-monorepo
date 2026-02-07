/**
 * Baram - Main App Component (Chat UI)
 *
 * Uses ChatLayout with left sidebar for session management
 * and model selection. Executor is auto-assigned via weighted random.
 */

import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { WalletConnect } from "@nasun/wallet-ui";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { ThemeToggle } from "./components/theme/ThemeToggle";
import { ChatLayout } from "./layouts/ChatLayout";
import { ChatInput } from "./components/input/ChatInput";
import { InputFooter } from "./components/input/InputFooter";
import { WelcomeScreen } from "./components/empty/WelcomeScreen";
import { LandingScreen } from "./components/empty/LandingScreen";
import { MessageList } from "./components/chat/MessageList";
import { AttestationDisplay } from "./features/request/components/AttestationDisplay";
import { useWalletSession } from "./hooks/useWalletSession";
import { useNFTGate } from "./hooks/useNFTGate";
import { NFTGateScreen } from "./components/empty/NFTGateScreen";
import { useRequestWithRetry } from "./features/request/hooks/useRequestWithRetry";
import { NETWORK_CONFIG, ModelId, DEFAULT_MODEL, MODEL_PRICING } from "./config/network";
import { useChatStore } from "./stores/chatStore";
import AuthCallback from "./pages/AuthCallback";
import { ErrorBoundary } from "./components/ErrorBoundary";

function AppContent() {
  const { isConnected, walletAddress } = useWalletSession();
  const { hasAccess, isLoading: nftLoading } = useNFTGate(walletAddress);
  const {
    submit,
    isProcessing,
    error,
    selectedExecutor,
    result,
    executorsLoading,
    executorsError,
    attestation,
  } = useRequestWithRetry();

  // Chat store
  const messages = useChatStore((state) => state.messages);
  const createSession = useChatStore((state) => state.createSession);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);

  // Auto-select default model
  useEffect(() => {
    if (!selectedModel) {
      setSelectedModel(DEFAULT_MODEL);
    }
  }, [selectedModel, setSelectedModel]);

  // Create session if none exists
  useEffect(() => {
    if (isConnected && !activeSessionId) {
      createSession();
    }
  }, [isConnected, activeSessionId, createSession]);

  const hasMessages = messages.length > 0 || isProcessing;

  // Header
  const header = (
    <header className="border-b border-[var(--color-border)] px-4 py-3">
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[var(--color-text-primary)] md:hidden">
            Baram
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <span className="text-xs text-[var(--color-text-muted)] px-2 py-1 rounded bg-[var(--color-bg-secondary)]">
            {NETWORK_CONFIG.networkName}
          </span>
          <WalletConnect />
        </div>
      </div>
    </header>
  );

  // Input Area
  const inputArea = (
    <div className="space-y-2">
      <ChatInput
        onSubmit={submit}
        disabled={isProcessing || !isConnected || !selectedExecutor || !hasAccess}
        placeholder={
          !isConnected
            ? "Connect wallet to start..."
            : executorsLoading
              ? "Loading executors..."
              : executorsError
                ? "Failed to load executors"
                : !selectedExecutor
                  ? "No eligible executors available"
                  : "Ask anything..."
        }
      />

      {/* Footer Info */}
      <InputFooter
        selectedModel={selectedModel as ModelId}
        selectedExecutor={selectedExecutor}
        requestId={result?.requestId}
        executionTime={result?.executionTimeMs}
      />

      {/* Error Display */}
      {error && (
        <div className="p-2 bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 rounded-lg">
          <p className="text-xs text-[var(--color-error)]">{error}</p>
        </div>
      )}
    </div>
  );

  return (
    <ChatLayout header={header} inputArea={inputArea}>
      {!isConnected ? (
        <LandingScreen />
      ) : nftLoading ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <span className="text-sm text-[var(--color-text-muted)]">Checking access...</span>
        </div>
      ) : !hasAccess ? (
        <NFTGateScreen />
      ) : !hasMessages ? (
        <>
          <WelcomeScreen onSuggestionClick={submit} />
          {selectedExecutor && (
            <div className="max-w-lg mx-auto mt-6">
              <AttestationDisplay teeType={selectedExecutor.teeType} attestation={attestation} />
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
          />
          {selectedExecutor && attestation.isVerified && (
            <div className="mt-4 text-center">
              <span className="inline-flex items-center gap-1 text-xs text-[var(--color-success)]">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
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
    </ChatLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Routes>
          <Route path="/callback" element={<AuthCallback />} />
          <Route path="*" element={<AppContent />} />
        </Routes>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
