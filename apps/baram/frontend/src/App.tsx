/**
 * Baram - Main App Component
 */

import { Routes, Route } from 'react-router-dom';
import { WalletConnect, BalanceDisplay, TokenFaucetButton } from '@nasun/wallet-ui';
import { useWallet, useZkLogin, useLedger, useMultiBalance } from '@nasun/wallet';
import { RequestForm } from './features/request/components/RequestForm';
import { NETWORK_CONFIG, BARAM_CONFIG } from './config/network';
import { ThemeProvider } from './components/theme/ThemeProvider';
import { ThemeToggle } from './components/theme/ThemeToggle';
import AuthCallback from './pages/AuthCallback';

function AppContent() {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const { isConnected: isLedgerConnected } = useLedger();
  const { data: balances } = useMultiBalance({});
  const isConnected = (status === 'unlocked' && !!account) || isZkLoggedIn || isLedgerConnected;

  // NUSDC balance (6 decimals)
  const nusdcBalance = balances?.tokens?.['NUSDC'];
  const nusdcAmount = nusdcBalance ? Number(nusdcBalance.balance) / 1e6 : 0;

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--color-border)] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-baram-1 flex items-center justify-center">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Baram
              </h1>
              <p className="text-xs text-[var(--color-text-muted)]">
                Private AI Computation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <span className="text-xs text-[var(--color-text-muted)] px-2 py-1 rounded bg-[var(--color-bg-secondary)]">
              {NETWORK_CONFIG.networkName}
            </span>
            <WalletConnect />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {!isConnected ? (
          // Not Connected State
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-baram-1/10 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-baram-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
              Private AI Computation
            </h2>
            <p className="text-[var(--color-text-secondary)] max-w-md mx-auto">
              Your prompts stay private. Payments are guaranteed through on-chain escrow.
              Connect your wallet in the header to get started.
            </p>
          </div>
        ) : (
          // Connected State
          <div className="space-y-6">
            {/* Balance Display */}
            <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
              <BalanceDisplay />
              {/* NUSDC Balance for Baram */}
              <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex items-center justify-between">
                <div>
                  <span className="text-sm text-[var(--color-text-secondary)]">NUSDC Balance: </span>
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {nusdcAmount.toLocaleString()} NUSDC
                  </span>
                </div>
                <TokenFaucetButton symbol="NUSDC" compact />
              </div>
            </div>

            {/* Request Form */}
            <RequestForm />

            {/* Info Section */}
            <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 text-sm">
              <h3 className="font-medium text-[var(--color-text-primary)] mb-2">
                How it works
              </h3>
              <ol className="list-decimal list-inside space-y-1 text-[var(--color-text-secondary)]">
                <li>Enter your prompt and select an AI model</li>
                <li>Pay with NUSDC (funds held in escrow)</li>
                <li>AI processes your request privately</li>
                <li>Result delivered, payment released automatically</li>
              </ol>
              <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                Executor: {BARAM_CONFIG.executorAddress.slice(0, 10)}...
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border)] px-6 py-4 mt-auto">
        <div className="max-w-4xl mx-auto text-center text-xs text-[var(--color-text-muted)]">
          Powered by Nasun Network
        </div>
      </footer>
    </div>
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
