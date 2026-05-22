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

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { AgentTxStatus, AgentCreationMode } from '../../hooks/useCreateAgent';
import { parseImportedAgentSecret } from '../../services/agentKeyStorage';
import { useCreateAgentBlocked } from '../../alpha/useCreateAgentBlocked';

interface CreateAgentModalProps {
  onClose: () => void;
  onCreate: (params: {
    mode: AgentCreationMode;
    agentAddress?: string;
    passphrase?: string;
    name: string;
    role: string;
    capabilities: string[];
    importedSecret?: string;
  }) => Promise<string | null>;
  txStatus: AgentTxStatus;
  txError: string | null;
  generatedAddress: string | null;
  fallbackKey: string | null;
  /**
   * True when the wallet already has at least one active agent. The success
   * footer flips from the Quickstart "Continue to Step 2" copy to an
   * "Open agent and fund budget" CTA, since the parent navigates straight
   * into the new agent's Settings tab instead of bouncing back to Quickstart.
   */
  isOnboarded?: boolean;
  /**
   * Connected wallet, used to surface the public-alpha gate state inline so
   * the user sees the block before filling out the form. The hook in
   * useCreateAgent enforces the same gate at submit time as the source of
   * truth, so a missing/undefined wallet here only degrades UX, not safety.
   */
  walletAddress?: string | null;
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
  isOnboarded = false,
  walletAddress,
}: CreateAgentModalProps) {
  // Surface the public-alpha gate as an inline notice before the user
  // bothers filling out the form. The functional gate lives in
  // useCreateAgent.ts so any future modal entry points stay safe.
  const alphaBlock = useCreateAgentBlocked(walletAddress ?? null);
  const alphaBlocked = alphaBlock.message;
  const [mode, setMode] = useState<AgentCreationMode>('generate');
  const [importMethod, setImportMethod] = useState<'key' | 'address'>('key');
  const [agentAddress, setAgentAddress] = useState('');
  const [importedSecret, setImportedSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [capInput, setCapInput] = useState('');
  const [copied, setCopied] = useState(false);

  const isBusy = txStatus === 'signing' || txStatus === 'executing';
  const isSuccess = txStatus === 'success';

  const parsedImport = useMemo(
    () => (mode === 'import' && importMethod === 'key' ? parseImportedAgentSecret(importedSecret) : null),
    [mode, importMethod, importedSecret],
  );
  const importSecretTouched = importedSecret.trim().length > 0;
  const isImportSecretValid = !importSecretTouched || !!parsedImport;

  // A passphrase is required whenever the app will hold the agent's key
  // locally: i.e. generate mode, or import-with-key.
  const needsPassphrase =
    mode === 'generate' || (mode === 'import' && importMethod === 'key');

  const isAddressValid = mode === 'import'
    ? importMethod === 'key'
      ? !!parsedImport
      : SUI_ADDRESS_RE.test(agentAddress)
    : true;
  const isPassphraseValid = needsPassphrase
    ? passphrase.length >= MIN_PASSPHRASE && passphrase === passphraseConfirm
    : true;
  const isNameValid = name.length > 0 && name.length <= MAX_NAME;
  const isRoleValid = role.length > 0 && role.length <= MAX_ROLE;
  const isFormValid =
    isAddressValid &&
    isPassphraseValid &&
    isNameValid &&
    isRoleValid &&
    isImportSecretValid &&
    !isBusy &&
    alphaBlocked === null;

  const handleSubmit = async () => {
    if (!isFormValid) return;
    const result = await onCreate({
      mode,
      agentAddress:
        mode === 'import' && importMethod === 'address' ? agentAddress : undefined,
      passphrase: needsPassphrase ? passphrase : undefined,
      importedSecret:
        mode === 'import' && importMethod === 'key' ? importedSecret.trim() : undefined,
      name,
      role,
      capabilities,
    });
    if (result) {
      setPassphrase('');
      setPassphraseConfirm('');
      setImportedSecret('');
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

  // Esc-to-close (parity with the other uju/ai modals)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, isBusy]);

  if (isSuccess) {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="create-agent-success-title">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative w-full max-w-sm bg-uju-card border border-uju-border/60 rounded-xl shadow-2xl p-6 text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p id="create-agent-success-title" className="text-sm font-medium text-white">Agent Registered</p>
          <p className="text-sm text-uju-secondary">{name} has been registered on-chain.</p>
          <p className="text-sm text-pado-2">
            {isOnboarded
              ? "Next: open this agent and fund its inference balance so it can pay executors."
              : "Next: fund this agent's inference balance so it can pay executors."}
          </p>
          {generatedAddress && (
            <div className="p-2 rounded-lg bg-uju-bg text-left space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-uju-secondary uppercase tracking-wide">Agent address</p>
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
            {isOnboarded ? 'Open agent and fund inference balance' : 'Continue to Step 2'}
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="create-agent-title">
      <div className="absolute inset-0 bg-black/60" onClick={isBusy ? undefined : onClose} />

      <div className="relative z-10 w-full max-w-md bg-uju-card border border-uju-border/60 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-uju-border/60">
          <h2 id="create-agent-title" className="text-base font-semibold text-white">Register Agent</h2>
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
          {alphaBlocked && (
            <div
              className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 space-y-1"
              role="status"
            >
              <p className="text-sm font-medium text-amber-300">
                Public alpha gate active
              </p>
              <p className="text-sm text-amber-200/90">{alphaBlocked}</p>
            </div>
          )}
          <div className="p-2 rounded-lg bg-pado-2/5 border border-pado-2/20">
            <p className="text-xs text-uju-secondary">
              A default capability and escrow will be created and linked to this agent. You can adjust risk limits and allowed actions in Settings later.
            </p>
          </div>
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
                : 'Register an existing agent. You can paste its key for in-browser signing, or just the address if the key lives elsewhere.'}
            </p>
          </div>

          {/* Mode-specific fields */}
          {mode === 'import' && (
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-uju-secondary">Import method</label>
              <div className="flex gap-1 p-0.5 rounded-lg bg-uju-bg">
                <button
                  type="button"
                  onClick={() => setImportMethod('key')}
                  className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                    importMethod === 'key' ? 'bg-pado-2 text-uju-bg' : 'text-uju-secondary hover:text-white'
                  }`}
                >
                  Paste key
                </button>
                <button
                  type="button"
                  onClick={() => setImportMethod('address')}
                  className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                    importMethod === 'address' ? 'bg-pado-2 text-uju-bg' : 'text-uju-secondary hover:text-white'
                  }`}
                >
                  Address only
                </button>
              </div>
              <p className="text-xs text-uju-secondary">
                {importMethod === 'key'
                  ? "Nasun AI encrypts and stores the key locally so it can sign on the agent's behalf."
                  : 'Register the address on-chain only. You keep the key in an external signer.'}
              </p>
            </div>
          )}

          {mode === 'import' && importMethod === 'address' && (
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
          )}

          {mode === 'import' && importMethod === 'key' && (
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-uju-secondary">Private key or recovery phrase *</label>
              <textarea
                value={importedSecret}
                onChange={(e) => setImportedSecret(e.target.value)}
                placeholder="suiprivkey1... or 12-word recovery phrase"
                rows={3}
                className={`${inputBase} font-mono resize-none ${
                  importSecretTouched && !parsedImport
                    ? 'border-red-400 focus:border-red-400'
                    : 'border-uju-border/60 focus:border-pado-2'
                }`}
              />
              {importSecretTouched && !parsedImport && (
                <p className="text-xs text-red-400">
                  Expecting a bech32 private key (suiprivkey1...) or a 12/24-word phrase.
                </p>
              )}
              {parsedImport && (
                <div className="p-2 rounded-lg bg-uju-bg text-xs space-y-0.5">
                  <p className="text-[11px] uppercase tracking-wider text-uju-secondary">Derived address</p>
                  <p className="font-mono text-white break-all">{parsedImport.address}</p>
                </div>
              )}
            </div>
          )}

          {needsPassphrase && (
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
                  This passphrase encrypts the agent's private key. You'll need it to export the key later. If lost, the key cannot be recovered.
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

          {/* Tags */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-wider text-uju-secondary">Tags (optional)</label>
              <span className="text-xs text-uju-secondary">
                {capabilities.length} / {MAX_CAPABILITIES}
              </span>
            </div>
            <p className="text-xs text-uju-secondary/70 leading-relaxed">
              Public labels shown on your agent card (e.g. "spot-trading", "momentum"). Descriptive only. They do not grant permissions or affect what the agent can do.
            </p>

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
                  ? 'Max tags reached'
                  : 'Type a tag and press Enter'
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
