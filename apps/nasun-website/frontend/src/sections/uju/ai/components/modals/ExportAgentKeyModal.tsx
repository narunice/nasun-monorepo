/**
 * ExportAgentKeyModal — reveal the agent's encrypted private key and (if
 * available) the BIP39 recovery mnemonic.
 *
 * Decryption happens in-browser using the passphrase the user set at agent
 * creation time; the secrets never leave the page. The modal shows tabs only
 * when both formats are available — older agents created before mnemonic
 * storage will only expose the raw private key.
 *
 * Security posture:
 *   - Passphrase input is type=password and never echoed back.
 *   - Secrets are blurred by default; user must click Reveal to read them.
 *   - Copy-to-clipboard uses navigator.clipboard.writeText (no DOM scrape).
 *   - On modal close we clear the local state holding the plaintext.
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { exportAgentSecrets, hasMnemonicStored } from '../../services/agentKeyStorage';

interface ExportAgentKeyModalProps {
  agentId: string;
  agentAddress: string;
  walletAddress: string;
  onClose: () => void;
}

type Tab = 'privateKey' | 'mnemonic';

const inputBase =
  'w-full px-3 py-2 text-sm rounded-lg bg-uju-bg border border-uju-border/60 text-white placeholder:text-uju-secondary/60 focus:outline-none focus:border-pado-2 transition-colors';

export function ExportAgentKeyModal({
  agentId,
  agentAddress,
  walletAddress,
  onClose,
}: ExportAgentKeyModalProps) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [mnemonicAvailable, setMnemonicAvailable] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('privateKey');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<Tab | null>(null);

  useEffect(() => {
    hasMnemonicStored(agentId)
      .then(setMnemonicAvailable)
      .catch(() => setMnemonicAvailable(false));
  }, [agentId]);

  const handleClose = useCallback(() => {
    setSecretKey(null);
    setMnemonic(null);
    setPassphrase('');
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose]);

  const handleDecrypt = async () => {
    setError(null);
    if (!passphrase) {
      setError('Enter the passphrase you set when creating this agent.');
      return;
    }
    setBusy(true);
    try {
      const result = await exportAgentSecrets(agentId, walletAddress, passphrase);
      if (!result) {
        setError('No encrypted key found for this agent in browser storage.');
        return;
      }
      if (result.derivedAddress.toLowerCase() !== agentAddress.toLowerCase()) {
        // Defence in depth — decrypted but pointing somewhere else.
        setError('Decrypted key derives a different address than this agent. Aborting.');
        return;
      }
      setSecretKey(result.secretKey);
      setMnemonic(result.mnemonic ?? null);
      setActiveTab(result.mnemonic ? 'mnemonic' : 'privateKey');
      setRevealed(false);
    } catch {
      setError('Decryption failed. The passphrase is incorrect, or the record is corrupt.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (which: Tab) => {
    const text = which === 'mnemonic' ? mnemonic : secretKey;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Clipboard copy failed. Select the text manually.');
    }
  };

  const decrypted = secretKey != null;
  const showMnemonicTab = mnemonicAvailable === true || mnemonic != null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-key-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-uju-card border border-uju-border/60 shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-uju-border/60">
          <h2 id="export-key-title" className="text-base font-semibold text-white">
            Export Agent Key
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-uju-secondary hover:bg-uju-bg/60 transition-colors"
            aria-label="Close"
          >
            <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-300">
            <p className="font-medium">Anyone with this key can fully control the agent.</p>
            <p className="mt-1 text-red-300/80">
              Store it in a password manager. Never paste it into a chat, screenshot, or untrusted
              terminal.
            </p>
          </div>

          {!decrypted && (
            <>
              <div className="space-y-2">
                <label htmlFor="export-passphrase" className="text-sm text-uju-secondary">
                  Agent passphrase
                </label>
                <input
                  id="export-passphrase"
                  type="password"
                  autoComplete="current-password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !busy) void handleDecrypt();
                  }}
                  placeholder="At least 6 characters"
                  className={inputBase}
                  disabled={busy}
                />
                <p className="text-sm text-uju-secondary/70">
                  Same passphrase you set when creating this agent. Decryption happens in your
                  browser only.
                </p>
              </div>

              {error && (
                <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={busy || !passphrase}
                onClick={() => void handleDecrypt()}
                className="w-full py-2.5 rounded-xl bg-pado-2 text-uju-bg text-sm font-medium hover:bg-pado-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? 'Decrypting...' : 'Decrypt and reveal'}
              </button>
            </>
          )}

          {decrypted && (
            <>
              {showMnemonicTab && (
                <div className="flex gap-1 border-b border-uju-border/60" role="tablist">
                  <TabButton
                    active={activeTab === 'mnemonic'}
                    onClick={() => setActiveTab('mnemonic')}
                    disabled={!mnemonic}
                  >
                    Recovery phrase
                  </TabButton>
                  <TabButton
                    active={activeTab === 'privateKey'}
                    onClick={() => setActiveTab('privateKey')}
                  >
                    Private key
                  </TabButton>
                </div>
              )}

              {activeTab === 'mnemonic' && mnemonic && (
                <SecretBox
                  label="12-word BIP39 recovery phrase"
                  value={mnemonic}
                  revealed={revealed}
                  copied={copied === 'mnemonic'}
                  onToggleReveal={() => setRevealed((v) => !v)}
                  onCopy={() => void handleCopy('mnemonic')}
                  hint="Use this to restore the agent in any BIP39-compatible wallet."
                />
              )}

              {activeTab === 'mnemonic' && !mnemonic && (
                <p className="text-sm text-uju-secondary/80">
                  This agent has no stored mnemonic (created before recovery-phrase support). Use
                  the private key tab instead.
                </p>
              )}

              {activeTab === 'privateKey' && secretKey && (
                <SecretBox
                  label="Agent private key (bech32)"
                  value={secretKey}
                  revealed={revealed}
                  copied={copied === 'privateKey'}
                  onToggleReveal={() => setRevealed((v) => !v)}
                  onCopy={() => void handleCopy('privateKey')}
                  hint="Paste this into nasun-ai-runtime .env as AGENT_PRIVATE_KEY."
                />
              )}

              <button
                type="button"
                onClick={handleClose}
                className="w-full py-2 rounded-xl border border-uju-border/60 text-sm text-uju-secondary hover:bg-uju-bg/60 transition-colors"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TabButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-pado-2 text-pado-2'
          : 'border-transparent text-uju-secondary hover:text-white disabled:opacity-40'
      }`}
    >
      {children}
    </button>
  );
}

function SecretBox({
  label,
  value,
  revealed,
  copied,
  onToggleReveal,
  onCopy,
  hint,
}: {
  label: string;
  value: string;
  revealed: boolean;
  copied: boolean;
  onToggleReveal: () => void;
  onCopy: () => void;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-uju-secondary">{label}</label>
        <button
          type="button"
          onClick={onToggleReveal}
          className="text-sm text-pado-2 hover:underline"
        >
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      </div>
      <div
        className={`px-3 py-2.5 rounded-lg bg-uju-bg border border-uju-border/60 text-sm font-mono break-all text-white select-all min-h-[64px] ${
          revealed ? '' : 'blur-sm select-none'
        }`}
        aria-live="polite"
      >
        {value}
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="px-3 py-1.5 rounded-lg border border-uju-border/60 text-sm text-uju-secondary hover:bg-uju-bg/60 transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        {hint && <p className="text-sm text-uju-secondary/70 text-right">{hint}</p>}
      </div>
    </div>
  );
}
