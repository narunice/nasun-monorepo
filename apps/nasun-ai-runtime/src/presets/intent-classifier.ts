/**
 * Trading-vs-general intent classifier for `user_message` wake events.
 *
 * Why a heuristic (and not an LLM call):
 *   We're on rotating free-tier LLM APIs (Groq/Cerebras typically 30
 *   req/min). Adding a classifier `/infer` call would double LLM usage
 *   for every user message and bring us closer to the free-tier ceiling.
 *   A keyword pass costs nothing and is good enough for v1, where the
 *   trading vocabulary is small and well-defined (BUY/SELL/swap/hold).
 *
 * Routing contract:
 *   - 'trading' → analyst preset (Budget deduction + cognition AER +
 *                 trade proposal card when LLM picks BUY/SELL)
 *   - 'chat'    → chat preset (LLM-only free-form reply, no on-chain,
 *                 no Budget, no AER; rate-limited)
 *
 * False-positive bias:
 *   When in doubt we lean toward 'chat'. The cost of misrouting a
 *   trade ask to chat is "agent answers in prose instead of opening
 *   a proposal" (user can re-ask with explicit BUY/SELL). The cost of
 *   misrouting smalltalk to analyst is what users actually hit on
 *   2026-05-23: every casual question gets stuffed into HOLD/BUY/SELL
 *   JSON and the agent looks broken.
 *
 *   Strong action verbs (buy/sell/매수/매도/swap) are the only
 *   unambiguous trading signal. Bare market words like "bitcoin" or
 *   "price" stay in chat unless paired with an action verb.
 */

export type Intent = 'trading' | 'chat';

export interface IntentDecision {
  intent: Intent;
  /** Which rule fired -- recorded in logs so misclassifications are
   *  diagnosable without reading the message itself. */
  matchedRule?: string;
}

/**
 * Imperative trade actions. Case-insensitive whole-word match.
 * Korean particles are appended via the `\b` substitute for Hangul.
 */
const STRONG_TRADE_VERBS = [
  // English imperatives / direct asks
  'buy', 'sell', 'swap', 'short', 'long',
  'go long', 'go short',
  'open position', 'close position', 'close my position',
  'take profit', 'stop loss',
  // Disambiguated questions ("should I buy")
  'should i buy', 'should i sell', 'should we buy', 'should we sell',
  'when to buy', 'when to sell',
  // Korean imperatives
  '매수', '매도',
  '사줘', '팔아', '사라', '팔아라', '사세요', '파세요',
  '살까', '팔까',
  '익절', '손절',
  '포지션 열어', '포지션 닫아', '청산',
];

/**
 * Detect a strong trade verb. Returns the matched fragment (lower-cased
 * for English) so the router can record `matchedRule`.
 *
 * Hangul has no word boundary in regex sense, so we substring-match for
 * Korean tokens. English tokens use \b boundaries to avoid matching
 * "buyer" or "selling" inside unrelated prose.
 */
export function classifyIntent(message: string): IntentDecision {
  const normalized = message.trim();
  if (!normalized) return { intent: 'chat', matchedRule: 'empty' };

  const lower = normalized.toLowerCase();

  for (const verb of STRONG_TRADE_VERBS) {
    if (isAscii(verb)) {
      // Word-boundary match for English so "buyer"/"selling" don't
      // false-positive. Multi-word phrases ("should i buy") match by
      // substring since the constituent words already imply intent.
      if (verb.includes(' ')) {
        if (lower.includes(verb)) return { intent: 'trading', matchedRule: verb };
      } else {
        const re = new RegExp(`\\b${escapeRe(verb)}\\b`, 'i');
        if (re.test(normalized)) return { intent: 'trading', matchedRule: verb };
      }
    } else {
      // Korean substring match (no word boundaries).
      if (normalized.includes(verb)) {
        return { intent: 'trading', matchedRule: verb };
      }
    }
  }

  return { intent: 'chat', matchedRule: 'no_strong_verb' };
}

function isAscii(s: string): boolean {
  return /^[\x00-\x7F]+$/.test(s);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
