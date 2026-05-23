// Deterministic intent classifier for Baram Telegram messages (Plan D §A12).
//
// Two outcome classes:
//   capability_change — user wants to modify capability/pause/policy.
//     Response: Dashboard deep link. No AER, no /wake forward.
//   forward — everything else.
//     Response: forward to agent-runner /wake (analyst preset decides action).
//
// LLM is NEVER involved in classification. Regex/keyword only.

export type IntentClass = 'capability_change' | 'forward';

// Patterns that indicate the user wants to change agent settings/capabilities.
// Conservative set: only fire when the message clearly refers to configuration,
// not normal trading queries that mention risk or limits in passing.
const CAPABILITY_CHANGE_PATTERNS: RegExp[] = [
  /\bpause\s*(agent|trading|bot|it)?\b/i,
  /\bresume\s*(agent|trading|bot|it)?\b/i,
  /\b(stop|disable|turn\s+off)\s+(agent|trading|it)\b/i,
  /\b(start|enable|turn\s+on)\s+(agent|trading|it)\b/i,
  /\bchange\s+(my\s+)?(risk|limit|setting|policy|capability|budget)\b/i,
  /\bupdate\s+(my\s+)?(risk|limit|setting|policy|capability|budget)\b/i,
  /\bset\s+(my\s+)?(risk|limit|slippage|stop.?loss|take.?profit|max.*trade|daily.*loss)\b/i,
  /\badjust\s+(my\s+)?(risk|limit|setting|policy)\b/i,
  /\b(lower|raise|increase|decrease|reduce)\s+(my\s+)?(risk|limit|slippage|budget)\b/i,
  /\bmodify\s+(my\s+)?(setting|policy|capability|limit)\b/i,
  /\bwake.?blocked\b/i,
  /\bfull.?suspend\b/i,
  /\bkill.?switch\b/i,
];

/**
 * Classify a Telegram message into an intent class.
 * Pure function; deterministic; no I/O.
 */
export function classifyIntent(message: string): IntentClass {
  const text = message.trim();
  for (const pattern of CAPABILITY_CHANGE_PATTERNS) {
    if (pattern.test(text)) return 'capability_change';
  }
  return 'forward';
}

/** Deep link to the Baram Dashboard for capability management. */
export function dashboardDeepLink(): string {
  return 'https://nasun.io/my-account?tab=agents';
}
