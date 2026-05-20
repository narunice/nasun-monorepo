// Resolve a brand icon (crypto token logo or stock logo) for a prediction
// market based on its category and question text. Question templates emitted
// by `bots/scripts/create-*-markets.ts` always carry the symbol/ticker in
// parentheses, so a small set of regexes plus a static allow-list of bundled
// SVG assets is enough.

export type IconKind = 'crypto' | 'stock';

export interface MarketIcon {
  kind: IconKind;
  symbol: string;
  src: string;
}

const CRYPTO_ICON_SYMBOLS = new Set([
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE',
  'AVAX', 'MATIC', 'LINK', 'DOT', 'UNI', 'ATOM', 'LTC',
  'BCH', 'XLM', 'TRX', 'ALGO',
]);

const STOCK_ICON_TICKERS = new Set([
  'AAPL', 'MSFT', 'NVDA', 'TSLA',
  '005930.KS', '000660.KS', '035420.KS', '035720.KS',
]);

export function resolveMarketIcon(
  category: string,
  question: string,
): MarketIcon | null {
  if (category === 'crypto') {
    const symbol = extractCryptoSymbol(question);
    if (symbol && CRYPTO_ICON_SYMBOLS.has(symbol)) {
      return { kind: 'crypto', symbol, src: `/crypto-icons/${symbol.toLowerCase()}.svg` };
    }
    return symbol ? { kind: 'crypto', symbol, src: '' } : null;
  }
  if (category === 'finance') {
    const symbol = extractStockTicker(question);
    if (symbol && STOCK_ICON_TICKERS.has(symbol)) {
      return { kind: 'stock', symbol, src: `/stock-icons/${symbol}.svg` };
    }
    return symbol ? { kind: 'stock', symbol, src: '' } : null;
  }
  return null;
}

export function extractCryptoSymbol(question: string): string | null {
  // Newer crypto-batch script: "Will Solana (SOL/USDT) close..."
  const paren = question.match(/\(([A-Z]{2,6})\/[A-Z]{2,5}\)/);
  if (paren) return paren[1];
  // Legacy/short form: "Will BTC/USDT...", "Will ETH price..."
  const match = question.match(/Will\s+([A-Z]{2,6})(?:\/|\s)/);
  return match ? match[1] : null;
}

export function extractStockTicker(question: string): string | null {
  // "Will Apple Inc. (AAPL) ..." / "Will Samsung (005930.KS) ..."
  const match = question.match(/\(([A-Z0-9.\-]{1,20})\)/);
  return match ? match[1] : null;
}
