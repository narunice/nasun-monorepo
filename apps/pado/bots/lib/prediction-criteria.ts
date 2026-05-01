/**
 * Prediction Market Resolution Criteria
 *
 * Parser + evaluator for the structured `resolution_criteria` text block
 * embedded in each Market. Used by prediction-keeper to decide YES/NO
 * outcomes deterministically from a market metadata + price tick.
 *
 * Expected block format (one field per line):
 *   Source: <https URL>
 *   Reading time: <YYYY-MM-DD HH:mm:ss UTC>
 *   Comparison: price <op> <threshold>     (op = >= | > | <= | <)
 *   Tie-breaking: <YES | NO | N/A> if exactly equal
 *
 * Pure module; no I/O, no external state.
 */

export type Comparison = '>=' | '>' | '<=' | '<';
export type TieBreak = 'YES' | 'NO' | 'N/A';

export interface ResolutionCriteria {
  source: string;
  symbol: string;
  comparison: Comparison;
  threshold: number;
  tieBreak: TieBreak;
}

export function parseResolutionCriteria(text: string): ResolutionCriteria | null {
  const sourceMatch = /^Source:\s*(\S+)/m.exec(text);
  const compMatch = /^Comparison:\s*price\s*(>=|<=|>|<)\s*([0-9]+(?:\.[0-9]+)?)/m.exec(text);
  const tieMatch = /^Tie-breaking:\s*(YES|NO|N\/A)/im.exec(text);

  if (!sourceMatch || !compMatch || !tieMatch) return null;

  const source = sourceMatch[1];
  const symbolMatch = /[?&]symbol=([A-Za-z0-9]+)/.exec(source);
  if (!symbolMatch) return null;
  const symbol = symbolMatch[1].toUpperCase();

  const threshold = parseFloat(compMatch[2]);
  if (!Number.isFinite(threshold) || threshold <= 0) return null;

  return {
    source,
    symbol,
    comparison: compMatch[1] as Comparison,
    threshold,
    tieBreak: tieMatch[1].toUpperCase() as TieBreak,
  };
}

/**
 * Decide the binary outcome from a price tick.
 *
 * On exact tie (price === threshold), an explicit YES/NO tie-break overrides
 * the comparison. 'N/A' falls through, letting the comparison decide:
 *   `>=` and `<=` return true on equality, `>` and `<` return false.
 *
 * Market authors should avoid `>` / `<` with `N/A` for boundary-sensitive
 * thresholds; the writing guide enforces this convention.
 */
export function evaluateOutcome(criteria: ResolutionCriteria, price: number): boolean {
  if (price === criteria.threshold) {
    if (criteria.tieBreak === 'YES') return true;
    if (criteria.tieBreak === 'NO') return false;
  }
  switch (criteria.comparison) {
    case '>=':
      return price >= criteria.threshold;
    case '>':
      return price > criteria.threshold;
    case '<=':
      return price <= criteria.threshold;
    case '<':
      return price < criteria.threshold;
  }
}

export const BINANCE_SYMBOL_TO_COINGECKO: Record<string, string> = {
  BTCUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  SOLUSDT: 'solana',
};
