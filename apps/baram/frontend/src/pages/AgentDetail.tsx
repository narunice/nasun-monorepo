/**
 * AgentDetail - Detailed view for a single agent profile
 * Shows overview, budget details with spending limits, and activity
 *
 * Features:
 * - Fund Gas: Transfer NASUN to agent address for transaction gas
 * - Export Key: Export encrypted agent keypair as base64 for agent-runner
 * - Kill Switch: Deactivate/reactivate agent (also deactivates budget)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Transaction } from '@mysten/sui/transactions';
import { useSigner } from '@nasun/wallet';
import { useWalletSession } from '../hooks/useWalletSession';
import { useAgentProfiles } from '../features/agents/hooks/useAgentProfiles';
import { useAgentBudgets, useSpendingLimits } from '../features/agents/hooks/useAgentBudgets';
import { useAgentActions } from '../hooks/useAgentActions';
import { suiClient } from '../config/client';
import { formatNusdcValue as formatNUSDC, truncateAddress as formatAddress, formatTimestamp } from '../utils/format';
import { exportAgentKeypairBase64, hasAgentKey } from '../services/agentKeyStorage';
import { useBudgets } from '../hooks/useBudgets';
import { CreateBudgetModal } from '../components/modals/CreateBudgetModal';

type Tab = 'overview' | 'budget' | 'activity';

const MAX_FUND_NASUN = 100;

export function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const { walletAddress } = useWalletSession();
  const { signer, address: signerAddress } = useSigner();
  const { data: agents, refetch: refetchAgents } = useAgentProfiles(walletAddress);
  const { data: budgets } = useAgentBudgets(walletAddress);
  const { deactivateAgent, reactivateAgent, txStatus: actionTxStatus, txError: actionTxError, resetTxStatus: resetActionTxStatus } = useAgentActions();
  const { createBudget, txStatus: budgetTxStatus, txError: budgetTxError, resetTxStatus: resetBudgetTxStatus, refresh: refreshBudgets } = useBudgets();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showReactivateConfirm, setShowReactivateConfirm] = useState(false);
  const [showCreateBudget, setShowCreateBudget] = useState(false);

  // Fund Gas state
  const [showFundGas, setShowFundGas] = useState(false);
  const [fundAmount, setFundAmount] = useState('0.1');
  const [fundStatus, setFundStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [fundError, setFundError] = useState<string | null>(null);
  const [fundTxDigest, setFundTxDigest] = useState<string | null>(null);

  // Export Key state
  const [showExportKey, setShowExportKey] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportedKey, setExportedKey] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [copied, setCopied] = useState(false);

  // Rate limiting for export passphrase attempts (persisted to localStorage)
  const rateLimitKey = `baram:export-attempts:${id}`;
  const exportFailedAttempts = useRef(0);
  const [exportLockedUntil, setExportLockedUntil] = useState<number | null>(null);

  // Load persisted rate limit state on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(rateLimitKey);
      if (raw) {
        const saved = JSON.parse(raw) as { attempts: number; lockedUntil: number | null };
        exportFailedAttempts.current = saved.attempts;
        if (saved.lockedUntil && Date.now() < saved.lockedUntil) {
          setExportLockedUntil(saved.lockedUntil);
        }
      }
    } catch { /* ignore corrupt data */ }
  }, [rateLimitKey]);

  // Auto-clear exported key after 30 seconds for security
  useEffect(() => {
    if (!exportedKey) return;
    const timer = setTimeout(() => {
      setExportedKey(null);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [exportedKey]);

  // Agent NASUN balance
  const [agentBalance, setAgentBalance] = useState<string | null>(null);

  const agent = agents?.find(a => a.id === id);
  const budget = budgets?.find(b => agent && b.agent === agent.agentAddress);
  const { data: spendingLimits } = useSpendingLimits(budget?.id ?? null);

  // Check if agent has stored key
  useEffect(() => {
    if (id) {
      hasAgentKey(id).then(setHasKey).catch(() => setHasKey(false));
    }
  }, [id]);

  // Fetch agent NASUN balance
  const fetchAgentBalance = useCallback(async () => {
    if (!agent) return;
    try {
      const bal = await suiClient.getBalance({ owner: agent.agentAddress });
      setAgentBalance((Number(bal.totalBalance) / 1e9).toFixed(4));
    } catch {
      setAgentBalance(null);
    }
  }, [agent]);

  useEffect(() => {
    fetchAgentBalance();
  }, [fetchAgentBalance]);

  // Fund Gas handler
  const handleFundGas = async () => {
    if (!signer || !signerAddress || !agent) return;
    const amount = parseFloat(fundAmount);
    if (isNaN(amount) || amount <= 0) {
      setFundError('Invalid amount');
      return;
    }
    if (amount > MAX_FUND_NASUN) {
      setFundError(`Maximum ${MAX_FUND_NASUN} NASUN per transfer`);
      return;
    }
    const amountSoe = Math.round(amount * 1e9);

    setFundStatus('sending');
    setFundError(null);
    setFundTxDigest(null);

    try {
      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountSoe)]);
      tx.transferObjects([coin], tx.pure.address(agent.agentAddress));
      tx.setSender(signerAddress);

      const txBytes = await tx.build({ client: suiClient });
      const { signature } = await signer.sign(txBytes);

      const result = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature,
        options: { showEffects: true },
      });

      if (result.effects?.status?.status !== 'success') {
        throw new Error(result.effects?.status?.error || 'Transaction failed');
      }

      setFundTxDigest(result.digest);
      setFundStatus('success');
      // Refresh agent balance
      setTimeout(fetchAgentBalance, 2000);
    } catch (err) {
      setFundError(err instanceof Error ? err.message : 'Transfer failed');
      setFundStatus('error');
    }
  };

  // Export Key handler with rate limiting
  const handleExportKey = async () => {
    if (!id || !walletAddress) return;

    // Check rate limit lockout
    if (exportLockedUntil && Date.now() < exportLockedUntil) {
      const seconds = Math.ceil((exportLockedUntil - Date.now()) / 1000);
      setExportError(`Too many attempts. Try again in ${seconds}s`);
      return;
    }

    setExportError(null);
    setExportedKey(null);

    try {
      const key = await exportAgentKeypairBase64(id, walletAddress, exportPassphrase);
      setExportedKey(key);
      exportFailedAttempts.current = 0;
      setExportLockedUntil(null);
      localStorage.removeItem(rateLimitKey);
    } catch (err) {
      const attempts = ++exportFailedAttempts.current;
      let lockUntil: number | null = null;
      if (attempts >= 16) {
        lockUntil = Date.now() + 30 * 60_000;
      } else if (attempts >= 12) {
        lockUntil = Date.now() + 5 * 60_000;
      } else if (attempts >= 8) {
        lockUntil = Date.now() + 30_000;
      }
      if (lockUntil) setExportLockedUntil(lockUntil);
      localStorage.setItem(rateLimitKey, JSON.stringify({ attempts, lockedUntil: lockUntil }));
      // AES-GCM decryption with wrong key throws DOMException with unhelpful message
      const isDecryptionError = err instanceof DOMException || (err instanceof Error && err.name === 'OperationError');
      setExportError(isDecryptionError ? 'Wrong passphrase' : (err instanceof Error ? err.message : 'Export failed'));
    }
  };

  // Clear exported key + passphrase when closing Export Key modal
  const handleCloseExportModal = () => {
    setExportedKey(null);
    setExportPassphrase('');
    setExportError(null);
    setCopied(false);
    setShowExportKey(false);
  };

  if (!agent) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link to="/agents" className="text-xs text-[var(--color-accent)] hover:underline">
          Back to Agents
        </Link>
        <p className="text-sm text-[var(--color-text-muted)] mt-8 text-center">Agent not found.</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'budget', label: 'Budget' },
    { key: 'activity', label: 'Activity' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <Link to="/agents" className="text-xs text-[var(--color-accent)] hover:underline">
        Agents
      </Link>

      {/* Agent header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{agent.name}</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono">
            {formatAddress(agent.agentAddress)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] px-2 py-1 rounded ${
              agent.isActive
                ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                : 'bg-[var(--color-text-muted)]/10 text-[var(--color-text-muted)]'
            }`}
          >
            {agent.isActive ? 'Active' : 'Inactive'}
          </span>
          {agent.isActive ? (
            <button
              onClick={() => { resetActionTxStatus(); setShowDeactivateConfirm(true); }}
              className="px-3 py-1 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Deactivate
            </button>
          ) : (
            <button
              onClick={() => { resetActionTxStatus(); setShowReactivateConfirm(true); }}
              className="px-3 py-1 text-xs rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              Reactivate
            </button>
          )}
        </div>
      </div>

      {/* Agent Runner Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => { setFundStatus('idle'); setFundError(null); setShowFundGas(true); }}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
        >
          Fund Gas {agentBalance !== null && `(${agentBalance} NASUN)`}
        </button>
        {hasKey && (
          <button
            onClick={() => { setExportPassphrase(''); setExportedKey(null); setExportError(null); setShowExportKey(true); }}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            Export Key for Agent Runner
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Action TX status */}
      {actionTxStatus === 'success' && (
        <div className="p-2 rounded-lg bg-emerald-500/10 text-xs text-emerald-400 text-center">
          Agent updated successfully
        </div>
      )}
      {actionTxError && (
        <div className="p-2 rounded-lg bg-red-500/10 text-xs text-red-400 text-center">
          {actionTxError}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab agent={agent} budget={budget ?? null} agentBalance={agentBalance} />
      )}
      {activeTab === 'budget' && (
        <BudgetTab
          budget={budget ?? null}
          spendingLimits={spendingLimits ?? null}
          onCreateBudget={() => { resetBudgetTxStatus(); setShowCreateBudget(true); }}
        />
      )}
      {activeTab === 'activity' && (
        <ActivityTab agent={agent} />
      )}

      {/* Deactivate confirmation modal */}
      {showDeactivateConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowDeactivateConfirm(false)} />
          <div className="relative w-full max-w-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-2xl p-5 space-y-3">
            <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
              <p className="text-xs text-red-400">
                Deactivate this agent? It will no longer process requests.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeactivateConfirm(false)}
                disabled={actionTxStatus === 'signing' || actionTxStatus === 'executing'}
                className="flex-1 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const ok = await deactivateAgent(agent.id);
                  if (ok) {
                    setShowDeactivateConfirm(false);
                    refetchAgents();
                  }
                }}
                disabled={actionTxStatus === 'signing' || actionTxStatus === 'executing'}
                className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {actionTxStatus === 'signing' || actionTxStatus === 'executing' ? 'Processing...' : 'Confirm Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate confirmation modal */}
      {showReactivateConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowReactivateConfirm(false)} />
          <div className="relative w-full max-w-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-2xl p-5 space-y-3">
            <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <p className="text-xs text-emerald-400">
                Reactivate this agent? It will resume processing requests.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowReactivateConfirm(false)}
                disabled={actionTxStatus === 'signing' || actionTxStatus === 'executing'}
                className="flex-1 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const ok = await reactivateAgent(agent.id);
                  if (ok) {
                    setShowReactivateConfirm(false);
                    refetchAgents();
                  }
                }}
                disabled={actionTxStatus === 'signing' || actionTxStatus === 'executing'}
                className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
              >
                {actionTxStatus === 'signing' || actionTxStatus === 'executing' ? 'Processing...' : 'Confirm Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fund Gas modal */}
      {showFundGas && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowFundGas(false)} />
          <div className="relative w-full max-w-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Fund Agent Gas</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              Transfer NASUN to agent address for transaction gas fees.
            </p>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Amount (NASUN)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={MAX_FUND_NASUN}
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              />
            </div>
            {fundStatus === 'success' && (
              <div className="p-2 rounded-lg bg-emerald-500/10 text-xs text-emerald-400 text-center space-y-1">
                <p>Transfer successful</p>
                {fundTxDigest && (
                  <a
                    href={`https://explorer.nasun.io/devnet/tx/${fundTxDigest}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline"
                  >
                    View on Explorer
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            )}
            {fundError && (
              <div className="p-2 rounded-lg bg-red-500/10 text-xs text-red-400 text-center">{fundError}</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowFundGas(false)}
                className="flex-1 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleFundGas}
                disabled={fundStatus === 'sending'}
                className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {fundStatus === 'sending' ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Budget modal */}
      {showCreateBudget && agent && (
        <CreateBudgetModal
          onClose={() => { setShowCreateBudget(false); refreshBudgets(); }}
          onCreate={createBudget}
          txStatus={budgetTxStatus}
          txError={budgetTxError}
          prefillAgent={agent.agentAddress}
        />
      )}

      {/* Export Key modal */}
      {showExportKey && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={handleCloseExportModal} />
          <div className="relative w-full max-w-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Export Agent Key</h3>
            <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="text-[10px] text-amber-400">
                This key can access funds connected to this agent's Budget. Store it securely and never share it.
              </p>
            </div>
            {!exportedKey ? (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Agent Passphrase</label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={exportPassphrase}
                    onChange={(e) => setExportPassphrase(e.target.value)}
                    placeholder="Enter your agent passphrase"
                    className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  />
                </div>
                {exportError && (
                  <div className="p-2 rounded-lg bg-red-500/10 text-xs text-red-400 text-center">{exportError}</div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleCloseExportModal}
                    className="flex-1 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExportKey}
                    disabled={!exportPassphrase || (exportLockedUntil !== null && Date.now() < exportLockedUntil)}
                    className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    Decrypt & Export
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Private Key</label>
                  <textarea
                    readOnly
                    value={exportedKey}
                    rows={3}
                    className="w-full px-3 py-2 text-[10px] font-mono rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] resize-none"
                  />
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Copy this value into your agent-runner .env file as AGENT_PRIVATE_KEY. Key auto-clears in 30 seconds.
                </p>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(exportedKey);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                      // Auto-clear clipboard after 30s for security
                      setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30_000);
                    } catch {
                      setExportError('Failed to copy. Please select and copy manually.');
                    }
                  }}
                  className="w-full py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy to Clipboard'}
                </button>
                <button
                  onClick={handleCloseExportModal}
                  className="w-full py-1.5 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewTab({ agent, budget, agentBalance }: {
  agent: { role: string; capabilities: string[]; createdAt: number; totalExecutions: number; totalSpent: number; agentAddress: string };
  budget: { balance: number; totalSpent: number; requestCount: number; isActive: boolean } | null;
  agentBalance: string | null;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Identity */}
      <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
        <h4 className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Identity</h4>
        <dl className="space-y-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Role</dt>
            <dd className="text-[var(--color-text-primary)]">{agent.role}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Address</dt>
            <dd className="text-[var(--color-text-primary)] font-mono">{formatAddress(agent.agentAddress)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Registered</dt>
            <dd className="text-[var(--color-text-primary)]">{formatTimestamp(agent.createdAt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Gas Balance</dt>
            <dd className="text-[var(--color-text-primary)]">{agentBalance !== null ? `${agentBalance} NASUN` : 'Loading...'}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-text-muted)] mb-1">Capabilities</dt>
            <dd className="flex gap-1.5 flex-wrap">
              {agent.capabilities.map(cap => (
                <span key={cap} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
                  {cap}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </div>

      {/* Stats */}
      <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
        <h4 className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Statistics</h4>
        <dl className="space-y-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Executions</dt>
            <dd className="text-[var(--color-text-primary)]">{agent.totalExecutions}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Total Spent</dt>
            <dd className="text-[var(--color-text-primary)]">{formatNUSDC(agent.totalSpent)} NUSDC</dd>
          </div>
          {budget && (
            <>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Budget Remaining</dt>
                <dd className="text-[var(--color-text-primary)]">{formatNUSDC(budget.balance)} NUSDC</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-muted)]">Budget Status</dt>
                <dd className={budget.isActive ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
                  {budget.isActive ? 'Active' : 'Inactive'}
                </dd>
              </div>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}

function BudgetTab({ budget, spendingLimits, onCreateBudget }: {
  budget: { id: string; balance: number; totalSpent: number; maxPerRequest: number; requestCount: number; createdAt: number; expiresAt: number } | null;
  spendingLimits: import('../features/agents/hooks/useAgentBudgets').SpendingLimits | null;
  onCreateBudget: () => void;
}) {
  if (!budget) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <svg className="w-10 h-10 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
        <p className="text-sm text-[var(--color-text-muted)]">
          No budget delegated to this agent.
        </p>
        <button
          onClick={onCreateBudget}
          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
        >
          Create Budget
        </button>
      </div>
    );
  }

  const totalDeposit = budget.balance + budget.totalSpent;

  return (
    <div className="space-y-4">
      {/* Budget overview */}
      <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
        <h4 className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Budget Overview</h4>
        <div className="flex justify-between text-sm text-[var(--color-text-primary)] mb-2">
          <span>Balance</span>
          <span className="font-semibold">{formatNUSDC(budget.balance)} / {formatNUSDC(totalDeposit)} NUSDC</span>
        </div>
        <div className="h-3 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-all"
            style={{ width: `${Math.min(100, (budget.balance / (totalDeposit || 1)) * 100)}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 text-xs">
          <div>
            <p className="text-[var(--color-text-muted)]">Max / Request</p>
            <p className="text-[var(--color-text-primary)] font-medium">{formatNUSDC(budget.maxPerRequest)} NUSDC</p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)]">Requests</p>
            <p className="text-[var(--color-text-primary)] font-medium">{budget.requestCount}</p>
          </div>
          <div>
            <p className="text-[var(--color-text-muted)]">Budget ID</p>
            <p className="text-[var(--color-text-primary)] font-mono">{formatAddress(budget.id)}</p>
          </div>
        </div>
      </div>

      {/* Spending Limits */}
      {spendingLimits && (
        <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
          <h4 className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Spending Limits</h4>
          <div className="space-y-3">
            <LimitGauge label="Daily" spent={spendingLimits.dailySpent} limit={spendingLimits.dailyLimit} />
            <LimitGauge label="Weekly" spent={spendingLimits.weeklySpent} limit={spendingLimits.weeklyLimit} />
            <LimitGauge label="Monthly" spent={spendingLimits.monthlySpent} limit={spendingLimits.monthlyLimit} />
          </div>
        </div>
      )}
    </div>
  );
}

function LimitGauge({ label, spent, limit }: { label: string; spent: number; limit: number }) {
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  const isNear = pct >= 80;
  const isOver = pct >= 100;

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[var(--color-text-secondary)]">{label}</span>
        <span className={isOver ? 'text-[var(--color-error)]' : isNear ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-primary)]'}>
          {formatNUSDC(spent)} / {formatNUSDC(limit)} NUSDC
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isOver ? 'bg-[var(--color-error)]' : isNear ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-accent)]'
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function ActivityTab({ agent }: { agent: { totalExecutions: number; lastActiveAt: number } }) {
  return (
    <div className="text-center py-8">
      <p className="text-sm text-[var(--color-text-muted)]">
        {agent.totalExecutions} executions
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-1">
        Last active: {agent.lastActiveAt ? formatTimestamp(agent.lastActiveAt) : 'Never'}
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-4">
        Detailed activity timeline coming soon.
      </p>
    </div>
  );
}
