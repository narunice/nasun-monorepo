/**
 * Wraps the AI tab content. Renders `children` only when the wallet is
 * `active` or `exempt`; for every other state the AlphaStatusPanel is
 * shown instead.
 *
 * Intended placement: inside AiTab.tsx, around the `view=*` switch. The
 * pre-launch UX (status='none' + gate_enabled=false) keeps the alpha
 * panel invisible to non-Genesis-Pass holders by showing the "alpha not
 * open yet" message there.
 *
 * Polling subscription lives on this component and is passed down to
 * AlphaStatusPanel via the `status` prop so we don't double-poll.
 */

import { useAlphaStatus } from './useAlphaStatus';
import { AlphaStatusPanel } from './AlphaStatusPanel';

interface Props {
  walletAddress: string;
  children: React.ReactNode;
  /**
   * When true, bypass the gate and render children regardless of alpha
   * state. Use this for the flag-OFF rollout phase — wire the gate now
   * but keep it inert until the prod flag flips. The poll still runs so
   * the banner can react when the flag goes on.
   */
  bypass?: boolean;
}

export function AlphaGate({ walletAddress, children, bypass }: Props) {
  const status = useAlphaStatus(walletAddress);

  if (bypass) return <>{children}</>;
  if (!status.status) return <>{children}</>;  // fail-open while loading

  // The states that get the regular AI tab. A first-time 'invited' user runs
  // activation through CreateAgentModal (inside `children`), with the banner
  // adding the time-to-claim warning above. A RETURNING 'invited' user
  // (resume=true) already has a paused agent and funds, so they get the panel
  // instead, which offers a one-tap Resume rather than the setup wizard.
  const s = status.status;
  const invitedFreshSetup = s.state === 'invited' && !s.resume;
  if (s.state === 'active' || s.state === 'exempt' || invitedFreshSetup) {
    return <>{children}</>;
  }

  return <AlphaStatusPanel walletAddress={walletAddress} status={status} />;
}
