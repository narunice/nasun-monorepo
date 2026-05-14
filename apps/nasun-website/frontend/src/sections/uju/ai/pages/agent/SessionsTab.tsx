/**
 * SessionsTab - list active Telegram sessions for an agent + per-session revoke.
 *
 * capabilityId persists in localStorage under
 * `nasun-ai:capability-id:<walletAddress>:<agentId>`.
 */

import { useState } from 'react';
import { useNasunAiSessions, useRevokeSession } from '../../hooks/useNasunAiSessions';
import { LinkTelegramModal } from '../../components/modals/LinkTelegramModal';

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
  const storageKey = `nasun-ai:capability-id:${walletAddress}:${agentId}`;

  const [savedCapId, setSavedCapId] = useState<string>(
    () => localStorage.getItem(storageKey) ?? '',
  );
  const [capIdInput, setCapIdInput] = useState(savedCapId);

  const { sessions, loading, error, reload } = useNasunAiSessions();
  const { revoke, revoking, error: revokeError } = useRevokeSession();
  const [showModal, setShowModal] = useState(false);

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
      <div className="p-4 rounded-xl bg-uju-card border border-uju-border/60 space-y-3">
        <div>
          <p className="text-sm font-medium text-white">Capability ID</p>
          <p className="text-sm text-uju-secondary mt-0.5">
            Required to create a session. Find it in your on-chain Capability object.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={capIdInput}
            onChange={(e) => setCapIdInput(e.target.value)}
            placeholder="0x..."
            className="flex-1 px-3 py-2 text-sm font-mono rounded-lg bg-uju-bg border border-uju-border/60 text-white placeholder:text-uju-secondary/60 focus:outline-none focus:border-pado-2"
          />
          <button
            type="button"
            onClick={handleSaveCapId}
            disabled={!SUI_ADDRESS_RE.test(capIdInput.trim())}
            className="px-3 py-2 text-sm rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors disabled:opacity-40"
          >
            Save
          </button>
        </div>
        {savedCapId && (
          <p className="text-sm text-emerald-400">
            Saved: {savedCapId.slice(0, 10)}...{savedCapId.slice(-6)}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Active Sessions</h3>
          <p className="text-sm text-uju-secondary mt-0.5">
            Each session lets @nasun_ai_bot notify you about this agent.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          disabled={!savedCapId}
          title={!savedCapId ? 'Save Capability ID first' : undefined}
          className="shrink-0 px-3 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Link Telegram
        </button>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 text-sm text-red-400">{error}</div>}
      {revokeError && (
        <div className="p-3 rounded-xl bg-red-500/10 text-sm text-red-400">{revokeError}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-uju-card/60 animate-pulse" />
          ))}
        </div>
      ) : agentSessions.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-uju-border/60 border-dashed space-y-2">
          <p className="text-sm text-uju-secondary">No active sessions.</p>
          <p className="text-sm text-uju-secondary/70">
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
                className="p-4 rounded-xl bg-uju-card border border-uju-border/60 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono text-uju-secondary">
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
                  <p className="text-sm text-uju-secondary/70">
                    Created {formatDate(session.createdAt)}
                  </p>
                  <p className="text-sm text-uju-secondary/70">
                    Expires {formatDate(session.expiresAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevoke(session.sid)}
                  disabled={isRevoking}
                  className="shrink-0 px-3 py-1.5 text-sm rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  {isRevoking ? 'Revoking...' : 'Revoke'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!loading && (
        <button
          type="button"
          onClick={() => void reload()}
          className="text-sm text-uju-secondary/70 hover:text-white transition-colors"
        >
          Reload sessions (requires wallet signature)
        </button>
      )}

      {showModal && savedCapId && (
        <LinkTelegramModal
          agentAddress={agentAddress}
          capabilityId={savedCapId}
          onClose={() => setShowModal(false)}
          onLinked={() => {
            void reload();
          }}
        />
      )}
    </div>
  );
}
