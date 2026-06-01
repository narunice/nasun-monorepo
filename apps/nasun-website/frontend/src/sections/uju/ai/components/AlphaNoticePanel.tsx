/**
 * Alpha-test capacity notice + inline waitlist join, self-contained.
 *
 * Mount at the top of the AI tab. All state (useAlphaStatus, signer,
 * waitlist busy/error) is encapsulated; the caller passes only walletAddress.
 *
 * This is the only UI surface that lets non-invited users reach the alpha
 * waitlist. AlphaGate / AlphaStatusPanel exist elsewhere but aren't wired
 * into the AI tab — without this panel the activation error
 * ("Open the AI tab to join the waitlist") has nowhere to land.
 */

import { useState, type ReactNode } from "react";
import { useSigner } from "@nasun/wallet";
import { useAlphaStatus } from "../alpha/useAlphaStatus";
import {
  joinAlphaWaitlist,
  leaveAlphaWaitlist,
  requestAlphaTgLink,
  AlphaApiError,
} from "../alpha/alphaApiClient";

const BASE_LINE =
  "Nasun AI alpha test. Up to 8 testers can run an agent at the same time. If every slot is taken, your agent joins a waitlist and rotates in when one frees up (every 36 hours). Genesis Pass holders are invited first; Alliance-only holders get a testing window in a later round.";

export function AlphaNoticePanel({ walletAddress }: { walletAddress: string }) {
  const alpha = useAlphaStatus(walletAddress);
  const { signer } = useSigner();
  const [busy, setBusy] = useState<"join" | "leave" | "tg" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gateOn = alpha.status?.capacity.gate_enabled ?? false;
  const state = alpha.status?.state;
  const eligible = alpha.status?.eligible;
  const queuePos = alpha.status?.queue_position;
  const queueDepth = alpha.status?.queue_depth;
  const inviteExpiresAt = alpha.status?.invite_expires_at ?? null;
  const tgBound = alpha.status?.tg_bound;

  const handleJoin = async () => {
    if (!signer) {
      setError("Connect your wallet first.");
      return;
    }
    setBusy("join");
    setError(null);
    try {
      await joinAlphaWaitlist(signer, walletAddress);
      alpha.refetch();
    } catch (err) {
      const code =
        err instanceof AlphaApiError ? err.code : (err as Error).message;
      setError(joinErrorMessage(code));
    } finally {
      setBusy(null);
    }
  };

  const handleTgConnect = async () => {
    if (!signer) {
      setError("Connect your wallet first.");
      return;
    }
    // Open the tab synchronously, while we still hold the click's user
    // activation. The signature + network round-trip below would otherwise
    // make a post-await window.open look unsolicited, so popup blockers
    // (esp. Safari / mobile) silently swallow it. We navigate this tab once
    // the deep link resolves. Sever the opener relationship to avoid
    // reverse-tabnabbing from the destination page.
    const pending = window.open("about:blank", "_blank");
    if (pending) pending.opener = null;
    setBusy("tg");
    setError(null);
    try {
      const { deepLink } = await requestAlphaTgLink(signer, walletAddress);
      // The bot's /start handler binds this wallet so invite DMs reach the
      // user. If the popup was blocked (pending === null) navigate the
      // current tab as a fallback rather than failing silently.
      if (pending && !pending.closed) {
        pending.location.href = deepLink;
      } else {
        window.location.href = deepLink;
      }
    } catch (err) {
      if (pending && !pending.closed) pending.close();
      const code =
        err instanceof AlphaApiError ? err.code : (err as Error).message;
      setError(`Could not start Telegram linking (${code}).`);
    } finally {
      setBusy(null);
    }
  };

  const handleLeave = async () => {
    if (!signer) return;
    if (
      !window.confirm(
        "Leave the alpha waitlist? You can re-join later but lose your spot.",
      )
    )
      return;
    setBusy("leave");
    setError(null);
    try {
      await leaveAlphaWaitlist(signer, walletAddress);
      alpha.refetch();
    } catch (err) {
      const code =
        err instanceof AlphaApiError ? err.code : (err as Error).message;
      setError(`Could not leave the waitlist (${code}).`);
    } finally {
      setBusy(null);
    }
  };

  // active / exempt / unknown gate-off → static notice only.
  if (!gateOn || state === "active" || state === "exempt") {
    return (
      <div className="rounded-lg border border-pado-2/30 bg-pado-2/5 px-3 py-2 text-sm text-uju-secondary">
        {BASE_LINE}
      </div>
    );
  }

  let statusLine: ReactNode = null;
  let action: ReactNode = null;
  const hasSigner = !!signer;

  if (state === "none") {
    if (eligible === false) {
      statusLine = (
        <span className="text-amber-200">
          Genesis Pass not detected on this wallet. Link your MetaMask on My
          Account and confirm the NFT to qualify for this round.
        </span>
      );
    } else if (eligible === true) {
      action = (
        <button
          type="button"
          onClick={handleJoin}
          disabled={busy !== null || !hasSigner}
          className="shrink-0 px-3 py-1.5 text-sm rounded-md bg-pado-2 text-uju-bg font-medium hover:bg-pado-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy === "join" ? "Signing..." : "Join waitlist"}
        </button>
      );
    } else {
      statusLine = (
        <span className="text-uju-secondary/70">
          Checking Genesis Pass eligibility...
        </span>
      );
    }
  } else if (state === "waiting") {
    statusLine = (
      <span className="text-pado-2">
        On the waitlist · position #{queuePos ?? "?"}
        {queueDepth ? ` of ${queueDepth}` : ""}. We'll notify you when a slot
        opens.
      </span>
    );
    action = (
      <button
        type="button"
        onClick={handleLeave}
        disabled={busy !== null}
        className="shrink-0 px-3 py-1.5 text-sm rounded-md border border-uju-border/60 text-uju-secondary hover:bg-uju-bg/60 disabled:opacity-50 transition-colors"
      >
        {busy === "leave" ? "Leaving..." : "Leave waitlist"}
      </button>
    );
  } else if (state === "invited") {
    statusLine = (
      <span className="text-pado-2 font-medium">
        Your alpha slot is ready! Activate an agent within{" "}
        {fmtRemaining(inviteExpiresAt)} to claim it.
      </span>
    );
  } else if (state === "paused") {
    statusLine = (
      <span className="text-amber-200">
        Your 36-hour session ended and the agent is paused. Funds and signing
        key are preserved.
      </span>
    );
  } else if (state === "expired") {
    statusLine = (
      <span className="text-uju-secondary/80">
        You missed two slot windows. Re-join below to try again from a fresh
        position.
      </span>
    );
    action = (
      <button
        type="button"
        onClick={handleJoin}
        disabled={busy !== null || !hasSigner}
        className="shrink-0 px-3 py-1.5 text-sm rounded-md bg-pado-2 text-uju-bg font-medium hover:bg-pado-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy === "join" ? "Signing..." : "Re-join waitlist"}
      </button>
    );
  }

  // Telegram opt-in for waitlist users who can't yet be DM'd. tg_bound is only
  // populated for waitlist states; `=== false` (not undefined) means the server
  // confirmed this wallet is unreachable, so we don't nag on older chat-servers
  // or states where DMs already work (active/paused have an agent session).
  const showTgConnect =
    (state === "waiting" || state === "invited" || state === "expired") &&
    tgBound === false;

  return (
    <div className="rounded-lg border border-pado-2/30 bg-pado-2/5 px-3 py-2.5 text-sm text-uju-secondary space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p>{BASE_LINE}</p>
          {statusLine && <p>{statusLine}</p>}
        </div>
        {action}
      </div>
      {showTgConnect && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-pado-2/20 pt-2">
          <span className="min-w-0 text-uju-secondary/90">
            Connect Telegram to get a DM the moment your slot opens, so you
            don't miss the claim window.
          </span>
          <button
            type="button"
            onClick={handleTgConnect}
            disabled={busy !== null || !hasSigner}
            className="shrink-0 px-3 py-1.5 text-sm rounded-md bg-pado-2 text-uju-bg font-medium hover:bg-pado-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy === "tg" ? "Opening..." : "Connect Telegram"}
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

function fmtRemaining(expiresAt: number | null): string {
  if (!expiresAt) return "6 hours";
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "0m";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function joinErrorMessage(code: string): string {
  switch (code) {
    case "genesis_pass_required":
      return "Genesis Pass NFT is required. Alliance-only holders get a testing window in a later round.";
    case "eligibility_check_unavailable":
      return "Eligibility check is temporarily unavailable. Try again in a moment.";
    case "already_active":
      return "Your agent is already active on the alpha.";
    case "slot_exempt":
      return "This wallet is administratively exempt and does not use the waitlist.";
    case "alpha_gate_disabled":
      return "The public alpha is not open yet.";
    case "bad_signature":
      return "Signature verification failed. Please try again.";
    case "rate_limited":
      return "Too many attempts. Please wait a few minutes and try again.";
    default:
      return `Could not join the waitlist (${code}).`;
  }
}
