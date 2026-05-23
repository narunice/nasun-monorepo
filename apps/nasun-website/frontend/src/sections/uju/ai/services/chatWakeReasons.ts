/**
 * Reason-code → user message + retry classification.
 *
 * Source of truth for these codes is the chat-server whitelist in
 * `chat-wake.ts:mapRuntimeReason` plus the inline error returns from the
 * three POST handlers. Anything the server might send back is mapped here;
 * an unknown reason collapses to a generic non-retryable error so the UI
 * never echoes raw runtime strings (ECONNREFUSED, stack hints, etc.).
 *
 * If you add a new reason on chat-server, mirror it here. The PR1 checklist
 * has a sync item for this (plan §J R4 / R9).
 */

export interface WakeReasonMapping {
  user: string;
  retryable: boolean;
}

const REASON_MAP: Record<string, WakeReasonMapping> = {
  // ---- /challenge ----
  invalid_wallet: { user: 'Invalid wallet address.', retryable: false },
  invalid_agent: { user: 'Invalid agent — re-select.', retryable: false },
  invalid_capability_id: { user: 'Invalid capability — re-select agent.', retryable: false },
  challenge_capacity: { user: 'Service is busy. Try again in a moment.', retryable: true },

  // ---- /session ----
  missing_fields: { user: 'Sign-in payload was incomplete. Try again.', retryable: true },
  unknown_challenge: { user: 'Challenge expired. Please sign again.', retryable: true },
  expired: { user: 'Sign-in challenge expired. Please sign again.', retryable: true },
  wrong_purpose: { user: 'Sign-in payload was for a different purpose.', retryable: false },
  bad_signature: { user: 'Signature rejected — please sign again.', retryable: true },
  internal_state: { user: 'Session state is missing. Please refresh.', retryable: false },
  agent_capability_mismatch: { user: 'Agent / capability mismatch.', retryable: false },
  capability_owner_mismatch: { user: 'This capability belongs to a different wallet.', retryable: false },
  capability_check_failed: { user: "Couldn't verify capability. Try again.", retryable: true },
  session_inactive: { user: 'Your session has expired. Please refresh.', retryable: false },

  // ---- Alpha gate (reasons from alpha-guards.ts) ----
  wallet_not_authorized: { user: 'Wallet is not authorized for alpha. Join the waitlist.', retryable: false },
  no_active_agent: { user: 'Create an agent first to chat.', retryable: false },
  agent_paused: { user: 'Agent is paused. Activate it to resume chat.', retryable: false },
  alpha_gate_off_but_no_agent: { user: 'Create an agent to enable chat.', retryable: false },

  // ---- /wake (synchronous returns) ----
  missing_token: { user: 'Your chat session is missing. Refresh and try again.', retryable: false },
  invalid_token: { user: 'Your chat session is invalid. Refresh and try again.', retryable: false },
  empty_message: { user: 'Message is empty.', retryable: false },
  message_too_long: { user: 'Message is too long (over 4,000 characters).', retryable: false },
  invalid_idempotency_key: { user: 'Request id was malformed. Retry.', retryable: true },
  idempotency_race: { user: 'Conflicting request. Retry.', retryable: true },
  agent_offline: { user: 'Agent runtime is offline. Retry shortly.', retryable: true },
  body_too_large: { user: 'Request was too large.', retryable: false },
  chat_wake_disabled: { user: 'Chat is temporarily disabled.', retryable: true },

  // ---- /wake (budget pre-check, 402) ----
  budget_unknown: { user: "Couldn't verify budget. Try again.", retryable: true },
  budget_no_active_budget: { user: 'No active budget. Activate one to chat.', retryable: false },
  budget_insufficient: { user: 'Inference balance is empty. Top up Budget.', retryable: false },
  budget_inactive: { user: 'No active budget. Activate one to chat.', retryable: false },

  // ---- /wake/:jobId (runtime outcome via mapRuntimeReason) ----
  gas_insufficient: {
    user: "Agent wallet has no NSN for gas. Deposit a small amount and retry.",
    retryable: true,
  },
  escrow_insufficient: {
    user: 'Agent escrow has no trade capital. Deposit NUSDC/NBTC and retry.',
    retryable: true,
  },
  notional_cap_exceeded: { user: 'Trade exceeds your notional cap.', retryable: false },
  rate_limited: { user: 'Provider is rate-limited. Try again shortly.', retryable: true },
  infer_failed: { user: 'Inference call failed. Try again shortly.', retryable: true },
  pending_lock: { user: 'A previous trade is still being processed. Try again shortly.', retryable: true },
  runtime_error: { user: 'Agent runtime hit an error. Try again shortly.', retryable: true },
  runtime_rejected: { user: 'Agent runtime rejected this request.', retryable: false },
  agent_unreachable: { user: 'Agent runtime is unreachable. Try again shortly.', retryable: true },
  daily_cap_reached: { user: 'Daily message limit reached. Resets at 00:00 UTC.', retryable: false },
  server_restarted: { user: 'Server restarted while this was in flight. Retry.', retryable: true },
  dispatch_error: { user: "Couldn't dispatch your message. Try again shortly.", retryable: true },
  wake_failed: { user: 'Your agent could not process that. Try again shortly.', retryable: true },

  // ---- Poll-only ----
  job_not_found: { user: 'This conversation lost its in-flight session.', retryable: false },
  invalid_job_id: { user: 'Conversation id was malformed.', retryable: false },

  // ---- Client-synthesized ----
  client_timeout: {
    user: "Still processing in background. Refresh to resume.",
    retryable: false,
  },
  client_reLease_exceeded: {
    user: 'Sign-in keeps expiring. Please refresh and try again.',
    retryable: false,
  },
  client_network_error: { user: 'Network error. Check your connection and retry.', retryable: true },
};

const FALLBACK: WakeReasonMapping = {
  user: 'Something went wrong. Try again shortly.',
  retryable: true,
};

export function mapReason(code: string | undefined | null): WakeReasonMapping {
  if (!code) return FALLBACK;
  return REASON_MAP[code] ?? FALLBACK;
}

export function isKnownReason(code: string): boolean {
  return code in REASON_MAP;
}

export function alphaGateTooltip(state: string): string {
  switch (state) {
    case 'invited':
      return 'Create an agent first to chat.';
    case 'paused':
      return 'Agent paused. Activate to resume.';
    case 'expired':
      return 'Alpha session expired. Re-join the waitlist.';
    case 'waiting':
      return "You're on the waitlist. We'll let you know when it's your turn.";
    case 'none':
      return 'Join alpha to chat with your trading agent.';
    default:
      return '';
  }
}
