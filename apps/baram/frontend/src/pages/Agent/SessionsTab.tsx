// SessionsTab - list active Telegram sessions for an agent + individual revoke
//
// Plan D §D-8. Consumes:
//   - useBaramSessions: list signed sessions (requires wallet sig per load)
//   - useRevokeSession: per-sid revoke (requires wallet sig per call)
//
// capabilityId is stored in localStorage (same pattern as EscrowTab for escrow ID).
// Key: baram:capability-id:<walletAddress>:<agentId>

import { useState } from 'react';
import { useBaramSessions, useRevokeSession } from '@/hooks/useBaramSessions';
import { LinkTelegramModal } from '@/components/modals/LinkTelegramModal';

const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;

interface SessionsTabProps {
  agentId: string;
  agentAddress: string;
  walletAddress: string;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateSid(s: string): string {
  return s.length > 16 ? `${s.slice(0, 8)}...${s.slice(-4)}` : s;
}

export function SessionsTab({ agentId, agentAddress, walletAddress }: SessionsTabProps) {
  const storageKey = `baram:capability-id:${walletAddress}:${agentId}`;

  const [savedCapId, setSavedCapId] = useState<string>(
    () => localStorage.getItem(storageKey) ?? '',
  );
  const [capIdInput, setCapIdInput] = useState(savedCapId);

  const { sessions, loading, error, reload } = useBaramSessions();
  const { revoke, revoking, error: revokeError } = useRevokeSession();
  const [showModal, setShowModal] = useState(false);

  // Filter to sessions for this agent only
  const agentSessions = sessions.filter(
    (s) => s.agent.toLowerCase() === agentAddress.toLowerCase(),
  );

  const handleSaveCapId = () => {
    const trimmed = capIdInput.trim();
    if (!SUI_ADDRESS_RE.test(trimmed)) return;
    localStorage.setItem(storageKey, trimmed);
    setSavedCapId(trimmed);
  };

  const handleRevoke = async (sid: string) => {
    const ok = await revoke(sid);
    if (ok) void reload();
  };

  return (
    <div className="space-y-5">
      {/* Capability ID setup (required before linking) */}
      <div className="p-4 rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] space-y-3">
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">Capability ID</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Required to create a session. Find it in your Baram Capability object on-chain.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={capIdInput}
            onChange={(e) => setCapIdInput(e.target.value)}
            placeholder="0x..."
            className="flex-1 px-3 py-2 text-xs font-mono rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
          />
          <button
            onClick={handleSaveCapId}
            disabled={!SUI_ADDRESS_RE.test(capIdInput.trim())}
            className="px-3 py-2 text-xs rounded-lg bg-[var(--color-accent)] text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            Save
          </button>
        </div>
        {savedCapId && (
          <p className="text-xs text-emerald-400">
            Saved: {savedCapId.slice(0, 10)}...{savedCapId.slice(-6)}
          </p>
        )}
      </div>

      {/* Sessions header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Active Sessions
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Each session lets @nasun_ai_bot notify you about this agent.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          disabled={!savedCapId}
          title={!savedCapId ? 'Save Capability ID first' : undefined}
          className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Link Telegram
        </button>
      </div>

      {/* Error banners */}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 text-sm text-red-400">{error}</div>
      )}
      {revokeError && (
        <div className="p-3 rounded-xl bg-red-500/10 text-sm text-red-400">{revokeError}</div>
      )}

      {/* Session list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-[var(--color-bg-tertiary)] animate-pulse" />
          ))}
        </div>
      ) : agentSessions.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-[var(--color-border)] border-dashed space-y-2">
          <p className="text-sm text-[var(--color-text-secondary)]">No active sessions.</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Link Telegram to receive trade alerts and confirmations.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {agentSessions.map((session) => {
            const isLinked = session.tgUserId !== null;
            const isRevoking = revoking.has(session.sid);
            return (
              <div
                key={session.sid}
                className="p-4 rounded-xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)] flex items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-[var(--color-text-secondary)]">
                      {truncateSid(session.sid)}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                        isLinked
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-yellow-500/10 text-yellow-400'
                      }`}
                    >
                      {isLinked ? 'Linked' : 'Pending'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Created {formatDate(session.createdAt)}
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Expires {formatDate(session.expiresAt)}
                  </p>
                </div>
                <button
                  onClick={() => void handleRevoke(session.sid)}
                  disabled={isRevoking}
                  className="shrink-0 px-3 py-1.5 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  {isRevoking ? 'Revoking...' : 'Revoke'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Reload note */}
      {!loading && (
        <button
          onClick={() => void reload()}
          className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          Reload sessions (requires wallet signature)
        </button>
      )}

      {/* Link modal */}
      {showModal && savedCapId && (
        <LinkTelegramModal
          agentId={agentId}
          agentAddress={agentAddress}
          capabilityId={savedCapId}
          onClose={() => setShowModal(false)}
          onLinked={() => {
            // Modal already closed by the user (X button fires onLinked + onClose).
            void reload();
          }}
        />
      )}
    </div>
  );
}
