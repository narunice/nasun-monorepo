// TRADER_CONFIG's venue ids were literals until 2026-10-07, and by then every
// one of them was dead on chain. The failure was silent: fetchAgentBalances
// read 0 for an escrow holding 20 NUSDC, so the agent decided HOLD "No NUSDC
// balance" forever and nothing said why. These tests pin the two properties
// that make a repeat loud instead of quiet -- a missing id throws and names
// itself, and a malformed one is refused rather than passed to the chain.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TRADER_CONFIG } from './trader.js';

const VENUE_ENV = [
  'POOL_NBTC_NUSDC',
  'COIN_NBTC_TYPE',
  'COIN_NUSDC_TYPE',
  'DEEP_TYPE',
  'DEEPBOOK_PACKAGE',
] as const;

const GOOD = {
  POOL_NBTC_NUSDC: '0x1addff570f17f0e12fa14c5f986806ce21bd5cc0542c4548ebf011a56eb26ec9',
  COIN_NBTC_TYPE: '0xeb10b5a62d591da68c4ea2bb2a18d2b440f855d6dfae2252d485733898ad5b11::nbtc::NBTC',
  COIN_NUSDC_TYPE: '0xeb10b5a62d591da68c4ea2bb2a18d2b440f855d6dfae2252d485733898ad5b11::nusdc::NUSDC',
  DEEP_TYPE: '0x642e81bd21a2dea6dd90d41a5f6bc18d6e63c0442f901d12198a894ed3b6a15a::deep::DEEP',
  DEEPBOOK_PACKAGE: '0xf0dce6bfc71db3f20be146e65a70cc721dd82d6bc1a1be84febfa58a1018ea00',
} as const;

// field on TRADER_CONFIG -> env var it reads
const FIELD_ENV: Array<[keyof typeof TRADER_CONFIG, (typeof VENUE_ENV)[number]]> = [
  ['pool', 'POOL_NBTC_NUSDC'],
  ['baseType', 'COIN_NBTC_TYPE'],
  ['quoteType', 'COIN_NUSDC_TYPE'],
  ['deepType', 'DEEP_TYPE'],
  ['deepbookPackage', 'DEEPBOOK_PACKAGE'],
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of VENUE_ENV) {
    saved[k] = process.env[k];
    process.env[k] = GOOD[k];
  }
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('venue ids come from the environment', () => {
  for (const [field, env] of FIELD_ENV) {
    it(`${String(field)} reads ${env}`, () => {
      expect(TRADER_CONFIG[field]).toBe(GOOD[env]);
    });
  }

  it('reflects a changed env without a reload', () => {
    // Getters, not a snapshot taken at module load: a non-trader preset
    // importing this module must not freeze or require trader env.
    const other = '0x' + 'a'.repeat(64);
    process.env.POOL_NBTC_NUSDC = other;
    expect(TRADER_CONFIG.pool).toBe(other);
  });
});

describe('a missing venue id fails loudly', () => {
  for (const [field, env] of FIELD_ENV) {
    it(`${String(field)} throws naming ${env} when unset`, () => {
      delete process.env[env];
      expect(() => TRADER_CONFIG[field]).toThrow(new RegExp(env));
    });

    it(`${String(field)} treats whitespace as unset`, () => {
      process.env[env] = '   ';
      expect(() => TRADER_CONFIG[field]).toThrow(new RegExp(env));
    });
  }
});

describe('a malformed venue id is refused, not forwarded', () => {
  it('rejects a non-hex pool id', () => {
    process.env.POOL_NBTC_NUSDC = 'not-an-object-id';
    expect(() => TRADER_CONFIG.pool).toThrow(/is not a Sui object id/);
  });

  it('rejects a pool id longer than 32 bytes', () => {
    process.env.POOL_NBTC_NUSDC = '0x' + 'a'.repeat(65);
    expect(() => TRADER_CONFIG.pool).toThrow(/is not a Sui object id/);
  });

  it('rejects a coin type that is only a package id', () => {
    // The old breakage shape: an id where a type name belongs.
    process.env.COIN_NUSDC_TYPE = GOOD.DEEPBOOK_PACKAGE;
    expect(() => TRADER_CONFIG.quoteType).toThrow(/is not a Move type name/);
  });

  it('rejects a type name missing its struct', () => {
    process.env.DEEP_TYPE = '0x642e81bd21a2dea6dd90d41a5f6bc18d6e63c0442f901d12198a894ed3b6a15a::deep';
    expect(() => TRADER_CONFIG.deepType).toThrow(/is not a Move type name/);
  });
});

describe('non-id fields stay constant', () => {
  it('keeps amounts and decimals as literals', () => {
    // These cannot rot against a redeploy, so they are deliberately not env.
    expect(TRADER_CONFIG.perTradeMaxQuoteRaw).toBe(2_000_000n);
    expect(TRADER_CONFIG.dailyMaxQuoteRaw).toBe(20_000_000n);
    expect(TRADER_CONFIG.baseDecimals).toBe(8);
    expect(TRADER_CONFIG.quoteDecimals).toBe(6);
    expect(TRADER_CONFIG.clockId).toBe('0x6');
  });
});
