/**
 * The single-panel UI for every alpha state. Driven by `useAlphaStatus`.
 * Renders one of seven views (none / waiting / invited / active / paused /
 * expired / exempt). `active` and `exempt` are rendered transparently —
 * the caller (AlphaGate) is expected to skip rendering this panel for
 * those states and show the regular AI tab instead.
 *
 * This component is intentionally self-contained: it owns the Join / Leave
 * button actions, the signing UX, and the error feedback. Caller only
 * passes the wallet address + signer.
 */

import { useState } from 'react';
import { useSigner } from '@nasun/wallet';
import {
  joinAlphaWaitlist,
  leaveAlphaWaitlist,
  AlphaApiError,
  type AlphaStatusResponse,
} from './alphaApiClient';
import { useAlphaStatus, type UseAlphaStatus } from './useAlphaStatus';

interface Props {
  walletAddress: string;
  /**
   * Optional pre-fetched status from a parent component. When omitted the
   * panel mounts its own `useAlphaStatus` poller. AlphaBanner + AlphaGate
   * share a single subscription via this prop to avoid duplicate polls.
   */
  status?: UseAlphaStatus;
}

function fmtRemaining(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function joinErrorMessage(code: string): string {
  switch (code) {
    case 'genesis_pass_required':
      return 'Genesis Pass NFT is required to join the alpha. Link your MetaMask + confirm your pass first.';
    case 'eligibility_check_unavailable':
      return 'The eligibility check is temporarily unavailable. Please try again in a moment.';
    case 'already_active':
      return 'Your agent is already active on the alpha.';
    case 'slot_exempt':
      return 'This wallet is administratively exempt and does not use the waitlist.';
    case 'alpha_gate_disabled':
      return 'The alpha is not open yet. Check back soon.';
    case 'bad_signature':
      return 'Signature verification failed. Please try again.';
    case 'rate_limited':
      return 'Too many attempts. Please wait a few minutes and try again.';
    default:
      return `Could not join the waitlist (${code}).`;
  }
}

function leaveErrorMessage(code: string): string {
  switch (code) {
    case 'bad_signature':
      return 'Signature verification failed. Please try again.';
    case 'alpha_gate_disabled':
      return 'The alpha is not open yet.';
    default:
      return `Could not leave the waitlist (${code}).`;
  }
}

export function AlphaStatusPanel({ walletAddress, status: external }: Props) {
  const fallback = useAlphaStatus(external ? null : walletAddress);
  const { status, loading, error: pollError, refetch } = external ?? fallback;
  const { signer } = useSigner();
  const [pending, setPending] = useState<'join' | 'leave' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const onJoin = async () => {
    if (!signer) {
      setActionError('Please connect your wallet first.');
      return;
    }
    setPending('join');
    setActionError(null);
    try {
      await joinAlphaWaitlist(signer, walletAddress);
      refetch();
    } catch (err) {
      const code = err instanceof AlphaApiError ? err.code : (err as Error).message;
      setActionError(joinErrorMessage(code));
    } finally {
      setPending(null);
    }
  };

  const onLeave = async () => {
    if (!signer) return;
    if (!window.confirm('Leave the alpha waitlist? You can re-join later but lose your spot.')) return;
    setPending('leave');
    setActionError(null);
    try {
      await leaveAlphaWaitlist(signer, walletAddress);
      refetch();
    } catch (err) {
      const code = err instanceof AlphaApiError ? err.code : (err as Error).message;
      setActionError(leaveErrorMessage(code));
    } finally {
      setPending(null);
    }
  };

  if (!status && loading) {
    return (
      <PanelShell>
        <p className="text-sm text-uju-secondary">Loading alpha status...</p>
      </PanelShell>
    );
  }

  if (!status) {
    return (
      <PanelShell>
        <p className="text-sm text-red-400">{pollError ?? 'Could not load alpha status.'}</p>
        <button
          type="button"
          onClick={refetch}
          className="mt-3 text-sm text-pado-2 hover:text-pado-1"
        >
          Retry
        </button>
      </PanelShell>
    );
  }

  switch (status.state) {
    case 'active':
    case 'exempt':
      // AlphaGate is expected to render the real AI tab for these states;
      // if this panel is somehow shown anyway, surface a minimal "alpha
      // active" confirmation so the user isn't confused.
      return (
        <PanelShell>
          <p className="text-sm text-uju-secondary">
            Your alpha access is active.
          </p>
        </PanelShell>
      );

    case 'paused':
      return (
        <PanelShell title="Alpha session ended">
          <Paragraph>
            Your 36-hour alpha session has expired and the agent is paused.
            Your funds and signing key are preserved — open the Dashboard
            and tap Deactivate to withdraw, or wait for the next round.
          </Paragraph>
          {status.paused_at && (
            <p className="text-xs text-uju-muted">
              Paused at {new Date(status.paused_at).toLocaleString('en-US')}
            </p>
          )}
        </PanelShell>
      );

    case 'invited':
      return (
        <PanelShell title="Your alpha slot is ready" highlight>
          <Paragraph>
            Activate an agent within {' '}
            <strong>{remaining(status.invite_expires_at)}</strong> to claim
            your spot. If you miss this window you'll be re-queued once.
          </Paragraph>
          <ActionRow>
            <PrimaryButton onClick={refetch} disabled={loading}>
              I'll activate now
            </PrimaryButton>
            <SecondaryButton
              onClick={onLeave}
              disabled={pending !== null}
            >
              {pending === 'leave' ? 'Leaving...' : 'Leave waitlist'}
            </SecondaryButton>
          </ActionRow>
          {actionError && <ErrorText>{actionError}</ErrorText>}
        </PanelShell>
      );

    case 'waiting':
      return (
        <PanelShell title="On the alpha waitlist">
          <Paragraph>
            You're position{' '}
            <strong>#{status.queue_position ?? '?'}</strong>
            {status.queue_depth ? ` of ${status.queue_depth}` : ''}. We'll
            notify you here and on Telegram when a slot opens.
          </Paragraph>
          <CapacityLine status={status} />
          <ActionRow>
            <SecondaryButton onClick={onLeave} disabled={pending !== null}>
              {pending === 'leave' ? 'Leaving...' : 'Leave waitlist'}
            </SecondaryButton>
          </ActionRow>
          {actionError && <ErrorText>{actionError}</ErrorText>}
        </PanelShell>
      );

    case 'expired':
      return (
        <PanelShell title="Alpha invite expired">
          <Paragraph>
            You missed two slot windows. Re-join the waitlist below to try
            again — you'll start from a fresh position.
          </Paragraph>
          <ActionRow>
            <PrimaryButton onClick={onJoin} disabled={pending !== null || !signer}>
              {pending === 'join' ? 'Signing...' : 'Re-join waitlist'}
            </PrimaryButton>
          </ActionRow>
          {actionError && <ErrorText>{actionError}</ErrorText>}
        </PanelShell>
      );

    case 'none':
    default:
      return renderNone({
        status,
        signer,
        pending,
        actionError,
        onJoin,
      });
  }
}

function renderNone(args: {
  status: AlphaStatusResponse;
  signer: ReturnType<typeof useSigner>['signer'];
  pending: 'join' | 'leave' | null;
  actionError: string | null;
  onJoin: () => void;
}) {
  const { status, signer, pending, actionError, onJoin } = args;

  if (!status.capacity.gate_enabled) {
    return (
      <PanelShell title="Nasun AI alpha">
        <Paragraph>
          The public alpha is not open yet. Watch the announcements channel
          for the launch date.
        </Paragraph>
        <CapacityLine status={status} />
      </PanelShell>
    );
  }

  if (status.eligible === false) {
    return (
      <PanelShell title="Genesis Pass required">
        <Paragraph>
          The alpha is open to Genesis Pass holders only. Link your
          MetaMask wallet on the My Account page and confirm your NFT to
          continue.
        </Paragraph>
        <CapacityLine status={status} />
      </PanelShell>
    );
  }

  return (
    <PanelShell title="Join the Nasun AI alpha" highlight>
      <Paragraph>
        Genesis Pass holders can claim one of {status.capacity.total} active
        slots. Each slot runs for 36 hours; when it ends your agent pauses
        and your funds stay safe.
      </Paragraph>
      <CapacityLine status={status} />
      <ActionRow>
        <PrimaryButton onClick={onJoin} disabled={pending !== null || !signer}>
          {pending === 'join' ? 'Signing...' : 'Join waitlist'}
        </PrimaryButton>
      </ActionRow>
      {actionError && <ErrorText>{actionError}</ErrorText>}
    </PanelShell>
  );
}

// ===== Small layout primitives — kept inline so PR-3.A doesn't introduce
// a new ui-primitive subdir. Inline JSX is easier to retune during
// dogfood than a shared theme file.

function PanelShell({
  title,
  highlight,
  children,
}: {
  title?: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={
        'rounded-2xl border p-6 space-y-3 ' +
        (highlight
          ? 'border-pado-2/60 bg-pado-2/5'
          : 'border-uju-border bg-uju-surface')
      }
    >
      {title && <h3 className="text-base font-semibold text-white">{title}</h3>}
      {children}
    </section>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-uju-secondary leading-relaxed">{children}</p>;
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-red-400">{children}</p>;
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2 pt-1">{children}</div>;
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-pado-2 hover:bg-pado-1 disabled:bg-uju-muted disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-uju-border hover:border-uju-border-hover disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm text-uju-secondary transition-colors"
    >
      {children}
    </button>
  );
}

function CapacityLine({ status }: { status: AlphaStatusResponse }) {
  if (!status.capacity.schema_ready) return null;
  return (
    <p className="text-xs text-uju-muted">
      {status.capacity.available} of {status.capacity.total} slots free
      {status.capacity.queue_depth > 0
        ? ` · ${status.capacity.queue_depth} in queue`
        : ''}
    </p>
  );
}

function remaining(expiresAt: number | null | undefined): string {
  if (!expiresAt) return '6 hours';
  return fmtRemaining(expiresAt - Date.now());
}
