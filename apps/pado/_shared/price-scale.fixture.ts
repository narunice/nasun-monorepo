/**
 * Shared fixture for DeepBook V3 priceScaleExp lockstep test.
 *
 * Imported by:
 *   - apps/pado/bots/lib/config.test.ts
 *   - apps/pado/frontend/src/lib/deepbook.test.ts
 *
 * Both test files assert that their local priceScaleExp(quoteDecimals,
 * baseDecimals) matches `expectedExp` for every case below. If somebody
 * changes the formula on one side without touching the other, the
 * untouched side's test breaks (because its locally computed exp no
 * longer matches the shared fixture). If somebody updates the fixture,
 * both sides re-run and either pass together or fail together.
 *
 * See project_2026_05_19_pado_price_10x_regression for context.
 */

export interface PriceScaleCase {
  label: string;
  quoteDecimals: number;
  baseDecimals: number;
  expectedExp: number;
}

export const PRICE_SCALE_FIXTURES: readonly PriceScaleCase[] = [
  { label: 'NBTC / NUSDC (baseDecimals=8)', quoteDecimals: 6, baseDecimals: 8, expectedExp: 7 },
  { label: 'NETH / NUSDC (baseDecimals=8)', quoteDecimals: 6, baseDecimals: 8, expectedExp: 7 },
  { label: 'NSOL / NUSDC (baseDecimals=9)', quoteDecimals: 6, baseDecimals: 9, expectedExp: 6 },
  { label: 'NSN  / NUSDC (baseDecimals=9)', quoteDecimals: 6, baseDecimals: 9, expectedExp: 6 },
] as const;
