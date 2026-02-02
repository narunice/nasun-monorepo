/**
 * Baram - Main App Component (Chat UI)
 *
 * Uses ChatLayout with left sidebar for session management
 * and model selection. Executor is auto-assigned via weighted random.
 */

import { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { WalletConnect } from '@nasun/wallet-ui';
import { useWallet, useZkLogin, useLedger, useSigner, getSessionPassword } from '@nasun/wallet';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { ThemeToggle } from './components/theme/ThemeToggle';
import { ChatLayout } from './layouts/ChatLayout';
import { ChatInput } from './components/input/ChatInput';
import { InputFooter } from './components/input/InputFooter';
import { WelcomeScreen } from './components/empty/WelcomeScreen';
import { LandingScreen } from './components/empty/LandingScreen';
import { MessageList, Message as UIMessage } from './components/chat/MessageList';
import { useCreateRequest } from './features/request/hooks/useCreateRequest';
import { useExecutors, selectExecutorWeightedRandom, ExecutorInfo } from './features/request/hooks/useExecutors';
import { useAttestation } from './features/request/hooks/useAttestation';
import { AttestationDisplay } from './features/request/components/AttestationDisplay';
import { NETWORK_CONFIG, ModelId, DEFAULT_MODEL, EXECUTOR_SELECTION, MODEL_PRICING, type TierLevel } from './config/network';
import { useChatStore } from './stores/chatStore';
import type { Message } from './types/chat';
import AuthCallback from './pages/AuthCallback';

// Convert store Message to UI Message (timestamp number -> Date)
function toUIMessage(msg: Message): UIMessage {
  return {
    ...msg,
    role: msg.role as 'user' | 'assistant',
    timestamp: new Date(msg.timestamp),
  };
}

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

function AppContent() {
  const { status, account, lockWallet } = useWallet();
  const { isConnected: isZkLoggedIn, logout: zkLogout } = useZkLogin();
  const { isConnected: isLedgerConnected } = useLedger();
  const { address: signerAddress } = useSigner();
  const isConnected = (status === 'unlocked' && !!account) || isZkLoggedIn || isLedgerConnected;

  // Get wallet address from useSigner (works for all connection types)
  const walletAddress = signerAddress || null;

  // Chat store
  const messages = useChatStore((state) => state.messages);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const createSession = useChatStore((state) => state.createSession);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const loadFromStorage = useChatStore((state) => state.loadFromStorage);
  const clearOnLogout = useChatStore((state) => state.clearOnLogout);

  // Track previous wallet address for disconnect detection
  const prevAddressRef = useRef<string | null>(null);

  // Idle timeout: lock password wallet or disconnect zkLogin after inactivity
  const handleIdleTimeout = useCallback(() => {
    if (status === 'unlocked') {
      console.log('[App] Idle timeout: locking password wallet');
      lockWallet();
    } else if (isZkLoggedIn) {
      console.log('[App] Idle timeout: disconnecting zkLogin session');
      zkLogout();
    }
  }, [status, isZkLoggedIn, lockWallet, zkLogout]);

  useIdleTimeout(handleIdleTimeout, IDLE_TIMEOUT_MS);

  // External hooks
  const { executors, isLoading: executorsLoading, error: executorsError } = useExecutors();
  const { status: requestStatus, error, result, createRequest, reset } = useCreateRequest();

  // Model provider determines executor tier requirement
  // Cloud models (groq, openai) can use any active executor (tier >= 0)
  // TEE local models require Bronze+ (tier >= 1)
  const modelProvider = MODEL_PRICING[selectedModel as ModelId]?.provider;
  const requiredMinTier: TierLevel = modelProvider === 'tee' ? 1 : 0;
  const needsAttestation = modelProvider === 'tee';

  // Auto-assign executor via weighted random
  const [selectedExecutor, setSelectedExecutor] = useState<ExecutorInfo | null>(null);
  const [failedExecutorIds, setFailedExecutorIds] = useState<Set<string>>(new Set());

  const assignedExecutor = useMemo(() => {
    if (executors.length === 0) return null;
    // TEE models must only use TEE executors (teeType > 0)
    const pool = needsAttestation ? executors.filter(e => e.teeType > 0) : executors;
    return selectExecutorWeightedRandom(pool, failedExecutorIds, requiredMinTier, selectedModel ?? undefined);
  }, [executors, failedExecutorIds, requiredMinTier, selectedModel, needsAttestation]);

  useEffect(() => {
    if (!assignedExecutor) return;
    // Re-assign when assignedExecutor changes (e.g., model switch triggers different executor)
    if (!selectedExecutor || selectedExecutor.id !== assignedExecutor.id) {
      console.log('[App] Auto-assigned executor:', assignedExecutor.name, `(tier=${assignedExecutor.tier})`);
      setSelectedExecutor(assignedExecutor);
    }
  }, [assignedExecutor, selectedExecutor]);

  // Debug: log executor fetch results
  useEffect(() => {
    if (!executorsLoading) {
      console.log('[App] Executors loaded:', {
        total: executors.length,
        active: executors.filter(e => e.isActive).length,
        eligible: executors.filter(e => e.isActive && e.tier >= 1).length,
        error: executorsError,
      });
    }
  }, [executors, executorsLoading, executorsError]);

  // Attestation: only fetch for TEE local models (cloud models skip TEE endpoint)
  const attestation = useAttestation(
    needsAttestation ? (selectedExecutor?.endpointUrl || null) : null,
    needsAttestation ? (selectedExecutor?.teeType || 0) : 0
  );

  // Handle wallet connect/disconnect
  useEffect(() => {
    const currentAddress = walletAddress;
    const prevAddress = prevAddressRef.current;

    console.log('[App] Wallet address changed:', { currentAddress: currentAddress?.slice(0, 8), prevAddress: prevAddress?.slice(0, 8) });

    if (currentAddress && currentAddress !== prevAddress) {
      // Wallet connected or changed - load data for this wallet
      // Dual-mode: password wallet gets address+password key, zkLogin gets address-only key
      const password = getSessionPassword();
      loadFromStorage(currentAddress, password ?? undefined);
    } else if (!currentAddress && prevAddress) {
      // Wallet disconnected - clear memory (keep encrypted data in IndexedDB)
      clearOnLogout();
    }

    prevAddressRef.current = currentAddress;
  }, [walletAddress, loadFromStorage, clearOnLogout]);

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

  // Handle result when completed
  useEffect(() => {
    if (requestStatus === 'completed' && result) {
      addMessage({
        role: 'assistant',
        content: result.result,
        metadata: {
          requestId: result.requestId,
          executionTimeMs: result.executionTimeMs,
          teeVerified: (selectedExecutor?.teeType ?? 0) > 0 && MODEL_PRICING[selectedModel as ModelId]?.provider === 'tee',
          txDigest: result.txDigest,
          resultHash: result.resultHash,
          teeType: result.teeType,
          pcr0: result.pcr0,
          attestationVerified: result.attestationVerified,
        },
      });
      reset();
      // Re-roll executor for next request
      setFailedExecutorIds(new Set());
      setSelectedExecutor(null);
    }
  }, [requestStatus, result, addMessage, reset]);

  const isProcessing = requestStatus === 'creating' || requestStatus === 'executing';

  const handleSubmit = useCallback(async (prompt: string) => {
    if (!prompt.trim() || isProcessing || !selectedExecutor) return;

    // Capture previous messages before adding new one
    const previousMessages = [...messages];

    // Add user message
    const userMessageId = addMessage({
      role: 'user',
      content: prompt,
    });

    // Create request with re-roll on failure
    const { MAX_RETRIES } = EXECUTOR_SELECTION;
    let currentExecutor: ExecutorInfo | null = selectedExecutor;
    const excluded = new Set<string>();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (!currentExecutor) break;

      try {
        await createRequest(prompt.trim(), selectedModel as ModelId, currentExecutor, {
          previousMessages,
        });
        return; // Success
      } catch {
        console.warn(`[App] Executor ${currentExecutor.name} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        excluded.add(currentExecutor.id);
        currentExecutor = selectExecutorWeightedRandom(executors, excluded, requiredMinTier, selectedModel ?? undefined);
        if (currentExecutor) {
          setSelectedExecutor(currentExecutor);
        }
      }
    }

    // All retries exhausted — mark user message as failed
    updateMessage(userMessageId, { failed: true });
    setFailedExecutorIds(excluded);
  }, [isProcessing, selectedExecutor, selectedModel, createRequest, addMessage, messages, executors]);

  const handleSuggestionClick = (prompt: string) => {
    handleSubmit(prompt);
  };

  const hasMessages = messages.length > 0 || isProcessing;

  // Convert messages for UI
  const uiMessages = messages.map(toUIMessage);

  // Header
  const header = (
    <header className="border-b border-[var(--color-border)] px-4 py-3">
      <div className="max-w-3xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Title moved to sidebar, keep minimal header on mobile */}
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
        onSubmit={handleSubmit}
        disabled={isProcessing || !isConnected || !selectedExecutor}
        placeholder={
          !isConnected ? 'Connect wallet to start...'
          : executorsLoading ? 'Loading executors...'
          : executorsError ? 'Failed to load executors'
          : !selectedExecutor ? 'No eligible executors available'
          : 'Ask anything...'
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
      ) : !hasMessages ? (
        // Empty State - Show Welcome Screen
        <>
          <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
          {/* Attestation Info */}
          {selectedExecutor && (
            <div className="max-w-lg mx-auto mt-6">
              <AttestationDisplay
                teeType={selectedExecutor.teeType}
                attestation={attestation}
              />
            </div>
          )}
        </>
      ) : (
        // Chat Messages
        <>
          <MessageList
            messages={uiMessages}
            isProcessing={isProcessing}
            processingStatus={requestStatus}
            isTeeExecutor={(selectedExecutor?.teeType ?? 0) > 0 && MODEL_PRICING[selectedModel as ModelId]?.provider === 'tee'}
          />
          {/* Attestation Info (collapsed) */}
          {selectedExecutor && attestation.isVerified && (
            <div className="mt-4 text-center">
              <span className="inline-flex items-center gap-1 text-xs text-[var(--color-success)]">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
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
    <ThemeProvider>
      <Routes>
        <Route path="/callback" element={<AuthCallback />} />
        <Route path="*" element={<AppContent />} />
      </Routes>
    </ThemeProvider>
  );
}
