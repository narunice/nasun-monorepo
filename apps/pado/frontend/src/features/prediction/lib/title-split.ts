// Split a prediction-market question into a main clause and a trailing
// subtitle (typically the resolution time or qualifying condition) so that
// market cards can render two-tier titles instead of one long wrapped line.
//
// Designed against the question templates emitted by:
//   - bots/scripts/create-short-term-markets.ts   (crypto and stock)
//   - bots/scripts/create-crypto-batch-markets.ts (crypto)
//   - bots/scripts/create-finance-markets.ts      (stock)
//   - bots/scripts/create-spacex-batch.ts         (launch missions)
//   - bots/scripts/create-skhynix-markets.ts      (stock multi-horizon)
//
// Conservative split: only trailing time/condition phrases are moved to the
// subtitle. The main clause keeps the trailing '?' so it still reads as a
// question. When no recognised pattern matches, the whole question stays in
// `main` and `subtitle` is null (no regression).

export interface TitleParts {
  main: string;
  subtitle: string | null;
}

const PATTERNS: ReadonlyArray<{
  re: RegExp;
  format: (match: RegExpMatchArray) => string;
}> = [
  // "on Binance at 2026-05-20 08:31:31 UTC" → "Binance · 2026-05-20 08:31 UTC"
  {
    re: /\s+on\s+Binance\s+at\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?\s*UTC\??$/i,
    format: (m) => `Binance · ${m[1]} ${m[2]}:${m[3]} UTC`,
  },
  // Generic "at YYYY-MM-DD HH:MM[:SS] UTC" suffix
  {
    re: /\s+at\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?\s*UTC\??$/i,
    format: (m) => `${m[1]} ${m[2]}:${m[3]} UTC`,
  },
  // "within +/- 24h of its scheduled NET" → "Within +/- 24h of scheduled NET"
  {
    re: /\s+(within\s+\+\/?-?\s*\d+\s*[hd]?\s+of\s+(?:its\s+)?scheduled\s+NET)\??$/i,
    format: (m) => capitalise(m[1].replace(/\s+its\s+/i, ' ')),
  },
  // "on 2026-05-21" (stock session date)
  {
    re: /\s+on\s+(\d{4}-\d{2}-\d{2})\??$/,
    format: (m) => `By ${m[1]}`,
  },
  // "by 2026-05-21" / "before 2026-05-21"
  {
    re: /\s+(?:by|before)\s+(\d{4}-\d{2}-\d{2})\??$/i,
    format: (m) => `By ${m[1]}`,
  },
  // "in May 2026" / "by May 2026"
  {
    re: /\s+(?:in|by)\s+([A-Z][a-z]+\s+\d{4})\??$/,
    format: (m) => `By ${m[1]}`,
  },
];

const MIN_MAIN_LENGTH = 12;

export function splitTitle(question: string): TitleParts {
  const trimmed = question.trim();
  if (!trimmed) return { main: '', subtitle: null };

  for (const { re, format } of PATTERNS) {
    const match = trimmed.match(re);
    if (!match) continue;
    const mainStart = trimmed.slice(0, match.index ?? 0).trim();
    if (mainStart.length < MIN_MAIN_LENGTH) continue;
    const main = endsWithQuestion(trimmed) && !endsWithQuestion(mainStart)
      ? `${mainStart}?`
      : mainStart;
    return { main, subtitle: format(match) };
  }

  return { main: trimmed, subtitle: null };
}

function endsWithQuestion(s: string): boolean {
  return s.endsWith('?');
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
