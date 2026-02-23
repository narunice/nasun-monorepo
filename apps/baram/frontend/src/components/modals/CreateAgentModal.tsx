/**
 * CreateAgentModal - Modal for registering a new agent profile on-chain
 */

import { useState, type KeyboardEvent } from 'react';
import type { AgentTxStatus } from '@/hooks/useCreateAgent';

interface CreateAgentModalProps {
  onClose: () => void;
  onCreate: (params: {
    agentAddress: string;
    name: string;
    role: string;
    capabilities: string[];
  }) => Promise<string | null>;
  txStatus: AgentTxStatus;
  txError: string | null;
}

const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;
const MAX_NAME = 64;
const MAX_ROLE = 32;
const MAX_CAPABILITIES = 10;
const MAX_CAPABILITY_LENGTH = 64;

export function CreateAgentModal({ onClose, onCreate, txStatus, txError }: CreateAgentModalProps) {
  const [agentAddress, setAgentAddress] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [capInput, setCapInput] = useState('');

  const isBusy = txStatus === 'signing' || txStatus === 'executing';
  const isSuccess = txStatus === 'success';

  const isAddressValid = SUI_ADDRESS_RE.test(agentAddress);
  const isNameValid = name.length > 0 && name.length <= MAX_NAME;
  const isRoleValid = role.length > 0 && role.length <= MAX_ROLE;
  const isFormValid = isAddressValid && isNameValid && isRoleValid && !isBusy;

  const handleSubmit = async () => {
    if (!isFormValid) return;
    await onCreate({ agentAddress, name, role, capabilities });
  };

  const addCapability = (value: string) => {
    const trimmed = value.trim().slice(0, MAX_CAPABILITY_LENGTH);
    if (!trimmed || capabilities.length >= MAX_CAPABILITIES || capabilities.includes(trimmed)) return;
    setCapabilities(prev => [...prev, trimmed]);
  };

  const handleCapKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addCapability(capInput);
      setCapInput('');
    }
  };

  const removeCapability = (index: number) => {
    setCapabilities(prev => prev.filter((_, i) => i !== index));
  };

  // Success state
  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative w-full max-w-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-2xl p-6 text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">Agent Registered</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {name} has been registered as an agent
          </p>
          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={isBusy ? undefined : onClose} />

      <div className="relative w-full max-w-md bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Register Agent</h2>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="p-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Agent Address */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
              Agent Address *
            </label>
            <input
              type="text"
              value={agentAddress}
              onChange={(e) => setAgentAddress(e.target.value)}
              placeholder="0x..."
              className={`w-full px-3 py-2 text-xs font-mono rounded-lg bg-[var(--color-bg-primary)] border text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition-colors
                ${agentAddress && !isAddressValid
                  ? 'border-red-400 focus:border-red-400'
                  : 'border-[var(--color-border)] focus:border-[var(--color-accent)]'
                }`}
            />
            {agentAddress && !isAddressValid && (
              <p className="text-[10px] text-red-400">Invalid address (0x + 64 hex chars)</p>
            )}
          </div>

          {/* Name */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                Name *
              </label>
              <span className={`text-[10px] ${
                name.length > MAX_NAME ? 'text-red-400' : name.length === MAX_NAME ? 'text-amber-400' : 'text-[var(--color-text-muted)]'
              }`}>
                {name.length} / {MAX_NAME}
              </span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))}
              placeholder="Agent name"
              className={`w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition-colors
                ${name.length > MAX_NAME
                  ? 'border-red-400 focus:border-red-400'
                  : 'border-[var(--color-border)] focus:border-[var(--color-accent)]'
                }`}
            />
          </div>

          {/* Role */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                Role *
              </label>
              <span className={`text-[10px] ${
                role.length > MAX_ROLE ? 'text-red-400' : role.length === MAX_ROLE ? 'text-amber-400' : 'text-[var(--color-text-muted)]'
              }`}>
                {role.length} / {MAX_ROLE}
              </span>
            </div>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value.slice(0, MAX_ROLE))}
              placeholder="e.g. researcher, analyst"
              className={`w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition-colors
                ${role.length > MAX_ROLE
                  ? 'border-red-400 focus:border-red-400'
                  : 'border-[var(--color-border)] focus:border-[var(--color-accent)]'
                }`}
            />
          </div>

          {/* Capabilities */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                Capabilities
              </label>
              <span className={`text-[10px] ${
                capabilities.length >= MAX_CAPABILITIES ? 'text-amber-400' : 'text-[var(--color-text-muted)]'
              }`}>
                {capabilities.length} / {MAX_CAPABILITIES}
              </span>
            </div>

            {/* Tags */}
            {capabilities.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {capabilities.map((cap, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
                  >
                    {cap}
                    <button
                      onClick={() => removeCapability(i)}
                      className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Tag input */}
            <input
              type="text"
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
              onKeyDown={handleCapKeyDown}
              disabled={capabilities.length >= MAX_CAPABILITIES}
              placeholder={capabilities.length >= MAX_CAPABILITIES ? 'Max capabilities reached' : 'Type and press Enter to add'}
              className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-50"
            />
          </div>

          {/* Error */}
          {txError && (
            <div className="p-2 rounded-lg bg-red-500/10 text-xs text-red-400 text-center">
              {txError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-[var(--color-border)]">
          <button
            onClick={onClose}
            disabled={isBusy}
            className="flex-1 py-2 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isFormValid}
            className="flex-1 py-2 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isBusy ? 'Processing...' : 'Register Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
