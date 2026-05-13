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
