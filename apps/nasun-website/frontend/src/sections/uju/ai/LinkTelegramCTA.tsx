// LinkTelegramCTA - Uju AI tab widget for linking Telegram via Nasun AI
//
// Plan D §D-8.  Two-step wallet sig protocol (same as baram frontend):
//   1. POST /api/baram/telegram/challenge  -> challenge string
//   2. POST /api/baram/telegram/link-session -> sid + deepLink
//
// capabilityId is stored in localStorage keyed by walletAddress + agentId,
// matching the Baram Dashboard EscrowTab/SessionsTab pattern.
//
// Shows QR + copy + "Open in Telegram" on success.

import { useState, useCallback, useEffect } from "react";
import { useSigner } from "@nasun/wallet";

const CHAT_SERVER_BASE =
  (import.meta.env.VITE_CHAT_SERVER_URL as string | undefined) ?? window.location.origin;
const QR_API = "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=";
const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;

async function fetchChallenge(
  wallet: string,
  purpose: "link",
  extra: { agent: string; capabilityId: string },
): Promise<string> {
  const res = await fetch(`${CHAT_SERVER_BASE}/api/baram/telegram/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, purpose, ...extra }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(
      typeof err.error === "string" ? err.error : `challenge failed: ${res.status}`,
    );
  }
  const data = (await res.json()) as { challenge: string };
  return data.challenge;
}

interface LinkResult {
  sid: string;
  deepLink: string;
  expiresAt: number;
}

type StepStatus = "idle" | "signing" | "submitting" | "success" | "error";

const LINKED_KEY_PREFIX = "baram:tg-linked:";

interface LinkTelegramCTAProps {
  agentId: string;
  agentAddress: string;
  walletAddress: string;
}

export function LinkTelegramCTA({ agentId, agentAddress, walletAddress }: LinkTelegramCTAProps) {
  const { signer, address } = useSigner();
  const storageKey = `baram:capability-id:${walletAddress}:${agentId}`;
  const linkedKey = `${LINKED_KEY_PREFIX}${walletAddress}:${agentId}`;

  const [capIdSaved, setCapIdSaved] = useState<string>(
    () => localStorage.getItem(storageKey) ?? "",
  );
  const [capIdInput, setCapIdInput] = useState(capIdSaved);
  const [isLinked, setIsLinked] = useState(
    () => localStorage.getItem(linkedKey) === "1",
  );

  const [status, setStatus] = useState<StepStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LinkResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSaveCap = () => {
    const trimmed = capIdInput.trim();
    if (!SUI_ADDRESS_RE.test(trimmed)) return;
    localStorage.setItem(storageKey, trimmed);
    setCapIdSaved(trimmed);
  };

  const handleLink = useCallback(async () => {
    if (!signer || !address) {
      setError("Wallet not connected");
      return;
    }
    if (!capIdSaved) {
      setError("Save Capability ID first");
      return;
    }
    setStatus("signing");
    setError(null);
    try {
      const challenge = await fetchChallenge(address, "link", {
        agent: agentAddress,
        capabilityId: capIdSaved,
      });
      const msgBytes = new TextEncoder().encode(challenge);
      const { signature } = await signer.signPersonal(msgBytes);

      setStatus("submitting");
      const res = await fetch(`${CHAT_SERVER_BASE}/api/baram/telegram/link-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, signature }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(
          typeof err.error === "string" ? err.error : `link failed: ${res.status}`,
        );
      }
      const data = (await res.json()) as LinkResult;
      setResult(data);
      setStatus("success");
      // Persist linked state so the badge shows on next visit
      localStorage.setItem(linkedKey, "1");
      setIsLinked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }, [signer, address, agentAddress, capIdSaved, linkedKey]);

  const handleCopy = async () => {
    if (!result?.deepLink) return;
    await navigator.clipboard.writeText(result.deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    return () => {
      setStatus("idle");
      setResult(null);
    };
  }, []);

  const isBusy = status === "signing" || status === "submitting";

  // Already linked (via localStorage persistence)
  if (isLinked && status !== "success") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        <span className="text-xs text-emerald-400 font-medium">Telegram Connected</span>
        <button
          onClick={() => {
            localStorage.removeItem(linkedKey);
            setIsLinked(false);
          }}
          className="ml-auto text-xs text-emerald-400/60 hover:text-emerald-400 transition-colors"
        >
          Link again
        </button>
      </div>
    );
  }

  // Success state: show QR
  if (status === "success" && result) {
    return (
      <div className="p-4 rounded-xl bg-uju-card border border-uju-border/60 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
          <p className="text-sm font-medium text-white">Telegram Link Ready</p>
        </div>
        <p className="text-xs text-uju-secondary">
          Scan or tap to open @nasun_ai_bot in Telegram, then the bot will confirm the connection.
        </p>
        {/* QR code — deep link is not sensitive (requires bot /start verification) */}
        <div className="flex justify-center">
          <img
            src={`${QR_API}${encodeURIComponent(result.deepLink)}`}
            alt="Telegram deep link QR code"
            width={180}
            height={180}
            className="rounded-xl border border-uju-border/60"
          />
        </div>
        <div className="flex gap-2">
          <a
            href={result.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium text-center hover:bg-blue-600 transition-colors"
          >
            Open in Telegram
          </a>
          <button
            onClick={() => void handleCopy()}
            className="px-3 py-2 rounded-xl border border-uju-border/60 text-sm text-uju-secondary hover:bg-uju-card/80 transition-colors shrink-0"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    );
  }

  // Busy state
  if (isBusy) {
    return (
      <div className="p-4 rounded-xl bg-uju-card border border-uju-border/60 flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
        <p className="text-sm text-uju-secondary">
          {status === "signing" ? "Waiting for wallet signature..." : "Creating session..."}
        </p>
      </div>
    );
  }

  // Idle / error: show setup + link button
  return (
    <div className="p-4 rounded-xl bg-uju-card border border-uju-border/60 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="currentColor"
            className="text-blue-400"
          >
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">Link Telegram</p>
          <p className="text-xs text-uju-secondary mt-0.5">
            Receive trade alerts and confirmations from @nasun_ai_bot.
          </p>
        </div>
      </div>

      {/* Capability ID input */}
      <div className="space-y-1.5">
        <p className="text-xs text-uju-secondary">
          Capability ID (find in{" "}
          <a
            href={`${import.meta.env.VITE_BARAM_DASHBOARD_URL ?? "http://localhost:5177"}/agents`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-pado-2 hover:underline"
          >
            Nasun AI Dashboard
          </a>
          {" "}Escrow tab)
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={capIdInput}
            onChange={(e) => setCapIdInput(e.target.value)}
            placeholder="0x..."
            className="flex-1 px-3 py-2 text-xs font-mono rounded-lg bg-uju-bg border border-uju-border/60 text-white placeholder-uju-secondary/40 focus:outline-none focus:ring-1 focus:ring-pado-2"
          />
          <button
            onClick={handleSaveCap}
            disabled={!SUI_ADDRESS_RE.test(capIdInput.trim())}
            className="px-3 py-2 text-xs rounded-lg bg-pado-2/20 text-pado-2 disabled:opacity-40 hover:bg-pado-2/30 transition-colors"
          >
            Save
          </button>
        </div>
        {capIdSaved && (
          <p className="text-xs text-emerald-400">
            Saved: {capIdSaved.slice(0, 10)}...{capIdSaved.slice(-6)}
          </p>
        )}
      </div>

      {status === "error" && error && (
        <div className="p-2.5 rounded-lg bg-red-500/10 text-xs text-red-400">{error}</div>
      )}

      <button
        onClick={() => void handleLink()}
        disabled={!capIdSaved}
        title={!capIdSaved ? "Save Capability ID first" : undefined}
        className="w-full py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Sign and Generate Link
      </button>
    </div>
  );
}
