/**
 * WakeTrigger — shared enum for AI agent wake events.
 *
 * Values mirror the on-chain `triggered_by_type` enum in
 * `baram_aer::aer` (apps/baram/contracts-aer/sources/aer.move).
 *
 * Forward-compat: enum is append-only. Off-chain decoders surface unknown
 * values as `unknown` rather than throwing, matching contract policy
 * (aer.move §Design principles 4).
 *
 * Phase 1 activates `heartbeat`, `user_message`, `manual`. The remaining
 * values (`price_alert`, `coordination`) are reserved enum members; their
 * runtime handling is deferred to Phase 2.
 */

// Semantic note: `triggered_by_type` labels the AER's *lifecycle stage*,
// not the user input channel. A single Telegram chat that ends in a
// confirmed trade produces TWO AERs:
//   1) analyst preset    -> tbt=2 (user_message), envelope=analysis.v1,
//      outcome=hold-noop. Cognition-only; no swap. A proposal card is
//      sent to TG awaiting confirm/cancel.
//   2) manual-execution  -> tbt=4 (manual), envelope=trade.swap.v1,
//      outcome=1, parent_intent_id=(1). The actual on-chain swap, fired
//      when the user taps Confirm on the proposal.
// Autonomous heartbeat (tbt=1) collapses both stages into one AER:
// envelope=trade.swap.v1, outcome=1, no human in the loop.
// So when classifying "what initiated this trade":
//   tbt=1 = agent itself (heartbeat cycle)
//   tbt=2 = no trade yet (analysis/proposal stage)
//   tbt=4 = user-confirmed trade (parent AER's tbt tells the channel)
export const WAKE_TRIGGER_VALUES = {
  heartbeat: 1,
  user_message: 2,
  price_alert: 3,
  manual: 4,
  coordination: 5,
} as const;

export type WakeTrigger = keyof typeof WAKE_TRIGGER_VALUES;
export type WakeTriggerValue = typeof WAKE_TRIGGER_VALUES[WakeTrigger];

const VALUE_TO_NAME: Record<number, WakeTrigger> = Object.fromEntries(
  Object.entries(WAKE_TRIGGER_VALUES).map(([name, value]) => [value, name as WakeTrigger]),
) as Record<number, WakeTrigger>;

export const ACTIVE_WAKE_TRIGGERS: ReadonlySet<WakeTrigger> = new Set<WakeTrigger>([
  'heartbeat',
  'user_message',
  'manual',
]);

export function wakeTriggerToValue(trigger: WakeTrigger): WakeTriggerValue {
  return WAKE_TRIGGER_VALUES[trigger];
}

export function wakeTriggerFromValue(value: number): WakeTrigger | 'unknown' {
  return VALUE_TO_NAME[value] ?? 'unknown';
}

export function isActiveWakeTrigger(trigger: WakeTrigger): boolean {
  return ACTIVE_WAKE_TRIGGERS.has(trigger);
}
