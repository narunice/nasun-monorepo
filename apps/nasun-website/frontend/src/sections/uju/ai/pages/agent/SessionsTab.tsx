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
  /**
   * On-chain capability id, read from `AgentProfile.capability` Option<ID>.
   * When set, the manual paste-in box is skipped entirely and Link Telegram
   * is immediately enabled. The localStorage fallback only fires for legacy
   * agents created before `create_agent_with_capability` shipped.
   */
  capabilityId: string | null;
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

export function SessionsTab({
  agentId,
  agentAddress,
  walletAddress,
  capabilityId,
}: SessionsTabProps) {
  const storageKey = `nasun-ai:capability-id:${walletAddress}:${agentId}`;

  // On-chain capability wins. Fall back to legacy localStorage only when
  // the AgentProfile has no `capability` linked (pre-Plan-B agents).
  const [savedCapId, setSavedCapId] = useState<string>(
    () => capabilityId ?? localStorage.getItem(storageKey) ?? '',
  );
  const [capIdInput, setCapIdInput] = useState(savedCapId);
  const hasOnChainCap = !!capabilityId;

  const { sessions, loading, error, reload } = useNasunAiSessions();
  const { revoke, revoking, error: revokeError } = useRevokeSession();
  const [showModal, setShowModal] = useState(false);

  const agentSessions = sessions.filter(
    (s) => s.agent.toLowerCase() === agentAddress.toLowerCase(),
  );
  // Push routing currently picks the most-recent active session per wallet
  // (LIMIT 1 in chat-server). A second link doesn't double the notifications,
  // it just silently supersedes the previous one — so the +Link button is
  // disabled while a linked session already exists. Pending (tgUserId=null)
  // rows don't count: those are sessions the user created but never opened
  // in Telegram, and re-linking is the natural way to recover from them.
  const hasLinkedSession = agentSessions.some((s) => s.tgUserId !== null);

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
      {!hasOnChainCap && (
        <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/30 space-y-3">
          <div>
            <p className="text-sm font-medium text-white">Legacy agent: no capability linked</p>
            <p className="text-sm text-uju-secondary mt-0.5">
              This agent was registered before on-chain capability linking shipped. Telegram
              sessions need a Capability object id. Either paste an existing one below, or register
              a new agent and use that instead (capability is auto-linked at creation time).
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
      )}

      <div>
        <h3 className="text-sm font-semibold text-white">Active Telegram Session</h3>
        <p className="text-sm text-uju-secondary mt-0.5">
          Lets @nasun_ai_bot notify you about this agent. One active session per
          agent — linking a new one supersedes the existing link.
        </p>
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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => void reload()}
            className="px-3 py-1.5 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg/60 hover:text-white transition-colors"
          >
            Reload sessions
          </button>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            disabled={!savedCapId || hasLinkedSession}
            title={
              !savedCapId
                ? 'Save Capability ID first'
                : hasLinkedSession
                  ? 'Already linked. Revoke the current session to link a new one.'
                  : undefined
            }
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Link Telegram
          </button>
        </div>
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
