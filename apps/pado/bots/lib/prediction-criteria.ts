/**
 * Prediction Market Resolution Criteria
 *
 * Parser + evaluator for the structured `resolution_criteria` text block
 * embedded in each Market. Used by prediction-keeper to decide YES/NO
 * outcomes deterministically from market metadata + a price reading.
 *
 * Two source kinds are supported:
 *
 * Crypto (single live tick):
 *   Source: https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
 *   Reading time: <YYYY-MM-DD HH:mm:ss UTC>
 *   Comparison: price <op> <threshold>
 *   Tie-breaking: <YES|NO|N/A> if exactly equal
 *
 * Stock (daily close):
 *   Source: https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day
 *   Symbol: AAPL
 *   Currency: USD
 *   Reading time: <YYYY-MM-DD HH:mm:ss UTC>   (= regular session close)
 *   Comparison: close <op> <threshold>
 *   Tie-breaking: <YES|NO|N/A>
 *
 * The kind discriminator is derived from the Source URL host. Crypto markets
 * keep extracting `symbol` from the URL query string (legacy); stock markets
 * use the explicit `Symbol:` line because path-based URLs (Yahoo) and tickers
 * containing dots (`005930.KS`) cannot be reliably extracted from a URL alone.
 *
 * Pure module; no I/O, no external state.
 */

export type Comparison = '>=' | '>' | '<=' | '<';
export type TieBreak = 'YES' | 'NO' | 'N/A';
export type CriteriaKind = 'crypto' | 'stock';

export interface ResolutionCriteria {
  kind: CriteriaKind;
  source: string;
  sourceHost: string;
  symbol: string;
  /** Required for stock; undefined for crypto. */
  currency?: string;
  comparison: Comparison;
  threshold: number;
  tieBreak: TieBreak;
}

const STOCK_HOSTS: ReadonlySet<string> = new Set([
  'api.twelvedata.com',
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
]);

const CRYPTO_HOSTS: ReadonlySet<string> = new Set([
  'api.binance.com',
  'api.coingecko.com',
]);

const STOCK_SYMBOL_RE = /^[A-Za-z0-9.\-]{1,20}$/;

function classifyHost(host: string): CriteriaKind | null {
  if (STOCK_HOSTS.has(host)) return 'stock';
  if (CRYPTO_HOSTS.has(host)) return 'crypto';
  return null;
}

export function parseResolutionCriteria(text: string): ResolutionCriteria | null {
  const sourceMatch = /^Source:\s*(\S+)/m.exec(text);
  // Accept both "price" (crypto live tick) and "close" (stock daily close) as
  // the variable name in the comparison line. Both ultimately map to a number.
  const compMatch = /^Comparison:\s*(?:price|close)\s*(>=|<=|>|<)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/m.exec(text);
  const tieMatch = /^Tie-breaking:\s*(YES|NO|N\/A)/im.exec(text);

  if (!sourceMatch || !compMatch || !tieMatch) return null;

  const source = sourceMatch[1];
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  const sourceHost = url.host.toLowerCase();
  const kind = classifyHost(sourceHost);
  if (!kind) return null;

  // Strip thousands separators ("90,001" -> "90001") before parseFloat so KR
  // KRW thresholds can be written human-readably in the criteria text.
  const threshold = parseFloat(compMatch[2].replace(/,/g, ''));
  if (!Number.isFinite(threshold) || threshold <= 0) return null;

  let symbol: string;
  let currency: string | undefined;

  if (kind === 'crypto') {
    const symbolMatch = /[?&]symbol=([A-Za-z0-9]+)/.exec(source);
    if (!symbolMatch) return null;
    symbol = symbolMatch[1].toUpperCase();
  } else {
    const symbolLine = /^Symbol:\s*([^\s]+)/m.exec(text);
    if (!symbolLine) return null;
    symbol = symbolLine[1].toUpperCase();
    if (!STOCK_SYMBOL_RE.test(symbol)) return null;

    const currencyLine = /^Currency:\s*([A-Z]{3})/m.exec(text);
    if (!currencyLine) return null;
    currency = currencyLine[1].toUpperCase();
  }

  return {
    kind,
    source,
    sourceHost,
    symbol,
    currency,
    comparison: compMatch[1] as Comparison,
    threshold,
    tieBreak: tieMatch[1].toUpperCase() as TieBreak,
  };
}

/**
 * Decide the binary outcome from a price reading.
 *
 * On exact tie (price === threshold), an explicit YES/NO tie-break overrides
 * the comparison. 'N/A' falls through, letting the comparison decide:
 *   `>=` and `<=` return true on equality, `>` and `<` return false.
 *
 * Stock markets where `close` falls exactly on an integer threshold are far
 * more likely than crypto ticks at floating-point ticks; the create-finance
 * script lints against integer thresholds with `>=`/`<=` + `Tie:NO` for that
 * reason.
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
  BNBUSDT: 'binancecoin',
  XRPUSDT: 'ripple',
  DOGEUSDT: 'dogecoin',
  AVAXUSDT: 'avalanche-2',
};
