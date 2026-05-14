/**
 * CreateAgentModal - Register a new AgentProfile on-chain.
 *
 * Two modes:
 *   - generate: nasun-ai mints a new Ed25519 keypair, encrypts it with the user's
 *               passphrase, stores in IndexedDB.
 *   - import:   user supplies an existing agent address; no key stored locally.
 *
 * Ported from baram CreateAgentModal; CSS variable tokens swapped for uju tailwind tokens.
 */

import { useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { AgentTxStatus, AgentCreationMode } from '../../hooks/useCreateAgent';

interface CreateAgentModalProps {
  onClose: () => void;
  onCreate: (params: {
    mode: AgentCreationMode;
    agentAddress?: string;
    passphrase?: string;
    name: string;
    role: string;
    capabilities: string[];
  }) => Promise<string | null>;
  txStatus: AgentTxStatus;
  txError: string | null;
  generatedAddress: string | null;
  fallbackKey: string | null;
}

const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;
const MAX_NAME = 64;
const MAX_ROLE = 32;
const MAX_CAPABILITIES = 10;
const MAX_CAPABILITY_LENGTH = 64;
const MIN_PASSPHRASE = 6;

const inputBase =
  'w-full px-3 py-2 text-sm rounded-lg bg-uju-bg border text-white placeholder:text-uju-secondary/60 focus:outline-none transition-colors';

export function CreateAgentModal({
  onClose,
  onCreate,
  txStatus,
  txError,
  generatedAddress,
  fallbackKey,
}: CreateAgentModalProps) {
  const [mode, setMode] = useState<AgentCreationMode>('generate');
  const [agentAddress, setAgentAddress] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [capInput, setCapInput] = useState('');
  const [copied, setCopied] = useState(false);

  const isBusy = txStatus === 'signing' || txStatus === 'executing';
  const isSuccess = txStatus === 'success';

  const isAddressValid = mode === 'import' ? SUI_ADDRESS_RE.test(agentAddress) : true;
  const isPassphraseValid =
    mode === 'generate'
      ? passphrase.length >= MIN_PASSPHRASE && passphrase === passphraseConfirm
      : true;
  const isNameValid = name.length > 0 && name.length <= MAX_NAME;
  const isRoleValid = role.length > 0 && role.length <= MAX_ROLE;
  const isFormValid = isAddressValid && isPassphraseValid && isNameValid && isRoleValid && !isBusy;

  const handleSubmit = async () => {
    if (!isFormValid) return;
    const result = await onCreate({
      mode,
      agentAddress: mode === 'import' ? agentAddress : undefined,
      passphrase: mode === 'generate' ? passphrase : undefined,
      name,
      role,
      capabilities,
    });
    if (result) {
      setPassphrase('');
      setPassphraseConfirm('');
    }
  };

  const addCapability = (value: string) => {
    const trimmed = value.trim().slice(0, MAX_CAPABILITY_LENGTH);
    if (!trimmed || capabilities.length >= MAX_CAPABILITIES || capabilities.includes(trimmed)) return;
    setCapabilities((prev) => [...prev, trimmed]);
  };

  const handleCapKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addCapability(capInput);
      setCapInput('');
    }
  };

  const removeCapability = (index: number) => {
    setCapabilities((prev) => prev.filter((_, i) => i !== index));
  };

  if (isSuccess) {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative w-full max-w-sm bg-uju-card border border-uju-border/60 rounded-xl shadow-2xl p-6 text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-white">Agent Registered</p>
          <p className="text-sm text-uju-secondary">{name} has been registered on-chain.</p>
          {generatedAddress && (
            <div className="p-2 rounded-lg bg-uju-bg text-left space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-uju-secondary uppercase tracking-wide">Generated address</p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedAddress).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="text-xs text-pado-2 hover:opacity-80 transition-opacity"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs font-mono text-white break-all">{generatedAddress}</p>
              <p className="text-xs text-amber-400">
                Key stored encrypted. You'll need your passphrase to export it later.
              </p>
            </div>
          )}
          <button
            onClick={onClose}
            className="w-full py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors"
          >
            Done
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={isBusy ? undefined : onClose} />

      <div className="relative z-10 w-full max-w-md bg-uju-card border border-uju-border/60 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-uju-border/60">
          <h2 className="text-base font-semibold text-white">Register Agent</h2>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="p-1.5 rounded-md hover:bg-uju-bg transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4 text-uju-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Mode toggle */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-uju-secondary">Key mode</label>
            <div className="flex gap-1 p-0.5 rounded-lg bg-uju-bg">
              <button
                onClick={() => setMode('generate')}
                className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                  mode === 'generate' ? 'bg-pado-2 text-uju-bg' : 'text-uju-secondary hover:text-white'
                }`}
              >
                Generate new key
              </button>
              <button
                onClick={() => setMode('import')}
                className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                  mode === 'import' ? 'bg-pado-2 text-uju-bg' : 'text-uju-secondary hover:text-white'
                }`}
              >
                Import existing key
              </button>
            </div>
            <p className="text-xs text-uju-secondary">
              {mode === 'generate'
                ? 'A new Ed25519 keypair will be generated and encrypted with your passphrase when you register.'
                : 'Use an existing agent address. The private key stays outside Nasun AI.'}
            </p>
          </div>

          {/* Mode-specific fields */}
          {mode === 'import' ? (
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-uju-secondary">Agent address *</label>
              <input
                type="text"
                value={agentAddress}
                onChange={(e) => setAgentAddress(e.target.value)}
                placeholder="0x..."
                className={`${inputBase} font-mono ${
                  agentAddress && !isAddressValid
                    ? 'border-red-400 focus:border-red-400'
                    : 'border-uju-border/60 focus:border-pado-2'
                }`}
              />
              {agentAddress && !isAddressValid && (
                <p className="text-xs text-red-400">Invalid address (0x + 64 hex chars)</p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider text-uju-secondary">Agent passphrase *</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder={`Min ${MIN_PASSPHRASE} characters`}
                  className={`${inputBase} ${
                    passphrase && passphrase.length < MIN_PASSPHRASE
                      ? 'border-red-400 focus:border-red-400'
                      : 'border-uju-border/60 focus:border-pado-2'
                  }`}
                />
                {passphrase && passphrase.length < MIN_PASSPHRASE && (
                  <p className="text-xs text-red-400">Passphrase must be at least {MIN_PASSPHRASE} characters</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider text-uju-secondary">Confirm passphrase *</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={passphraseConfirm}
                  onChange={(e) => setPassphraseConfirm(e.target.value)}
                  placeholder="Re-enter passphrase"
                  className={`${inputBase} ${
                    passphraseConfirm && passphrase !== passphraseConfirm
                      ? 'border-red-400 focus:border-red-400'
                      : 'border-uju-border/60 focus:border-pado-2'
                  }`}
                />
                {passphraseConfirm && passphrase !== passphraseConfirm && (
                  <p className="text-xs text-red-400">Passphrases do not match</p>
                )}
              </div>
              <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <p className="text-xs text-amber-400">
                  This passphrase encrypts the agent's private key. You'll need it to export the key for the agent runner. If lost, the key cannot be recovered.
                </p>
              </div>
            </>
          )}

          {/* Name */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wider text-uju-secondary">Name *</label>
              <span className="text-xs text-uju-secondary">
                {name.length} / {MAX_NAME}
              </span>
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))}
              placeholder="Agent name"
              className={`${inputBase} border-uju-border/60 focus:border-pado-2`}
            />
          </div>

          {/* Role */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wider text-uju-secondary">Role *</label>
              <span className="text-xs text-uju-secondary">
                {role.length} / {MAX_ROLE}
              </span>
            </div>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value.slice(0, MAX_ROLE))}
              placeholder="e.g. trader, analyst"
              className={`${inputBase} border-uju-border/60 focus:border-pado-2`}
            />
          </div>

          {/* Capabilities */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wider text-uju-secondary">Capabilities</label>
              <span className="text-xs text-uju-secondary">
                {capabilities.length} / {MAX_CAPABILITIES}
              </span>
            </div>

            {capabilities.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {capabilities.map((cap, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-uju-bg text-uju-secondary"
                  >
                    {cap}
                    <button
                      onClick={() => removeCapability(i)}
                      className="text-uju-secondary hover:text-white transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            <input
              type="text"
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
              onKeyDown={handleCapKeyDown}
              disabled={capabilities.length >= MAX_CAPABILITIES}
              placeholder={
                capabilities.length >= MAX_CAPABILITIES
                  ? 'Max capabilities reached'
                  : 'Type and press Enter to add'
              }
              className={`${inputBase} border-uju-border/60 focus:border-pado-2 disabled:opacity-50`}
            />
          </div>

          {txError && (
            <div className="p-2 rounded-lg bg-red-500/10 text-sm text-red-400 text-center">{txError}</div>
          )}

          {fallbackKey && (
            <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 space-y-2">
              <p className="text-xs text-red-400 font-medium">
                Copy this key now. It cannot be recovered after closing this dialog.
              </p>
              <textarea
                readOnly
                value={fallbackKey}
                rows={3}
                className="w-full px-2 py-1 text-xs font-mono rounded bg-uju-bg border border-uju-border/60 text-white resize-none"
              />
              <p className="text-xs text-amber-400">Store this in a password manager or secure location.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-uju-border/60">
          <button
            onClick={onClose}
            disabled={isBusy}
            className="flex-1 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isFormValid}
            className="flex-1 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors disabled:opacity-50"
          >
            {isBusy ? 'Processing...' : 'Register Agent'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
