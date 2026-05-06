/**
 * PriceChart types and constants
 */

// NOTE: '1m' = 1 minute, '1M' = 1 month (case-sensitive). Never use toLowerCase() on intervals.
export type TimeInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1M';

export const INTERVAL_CONFIG: Record<TimeInterval, { label: string; ms: number; count: number }> = {
  '1m': { label: '1분', ms: 60 * 1000, count: 120 },
  '5m': { label: '5분', ms: 5 * 60 * 1000, count: 96 },
  '15m': { label: '15분', ms: 15 * 60 * 1000, count: 96 },
  '1h': { label: '1시간', ms: 60 * 60 * 1000, count: 72 },
  '4h': { label: '4시간', ms: 4 * 60 * 60 * 1000, count: 90 },
  '1d': { label: '1일', ms: 24 * 60 * 60 * 1000, count: 90 },
  '1w': { label: '1주', ms: 7 * 24 * 60 * 60 * 1000, count: 104 },
  '1M': { label: '1M', ms: 30 * 24 * 60 * 60 * 1000, count: 60 },
};

export const CHART_HEIGHT = 280;
export const VOLUME_HEIGHT = 80;
export const RSI_HEIGHT = 80;
export const MACD_HEIGHT = 100;
export const STOCH_HEIGHT = 80;
export const ATR_HEIGHT = 80;

export const CHART_COLORS = {
  dark: {
    background: '#0d141e',
    text: '#d1d4dc',
    grid: '#1a2332',
    border: '#1f3a61',
    candleUp: '#26a69a',
    candleDown: '#ef5350',
    volumeUp: 'rgba(38, 166, 154, 0.45)',
    volumeDown: 'rgba(239, 83, 80, 0.45)',
  },
  light: {
    background: '#ffffff',
    text: '#191615',
    grid: '#cdd3db',
    border: '#aac9d5',
    candleUp: '#22c55e',
    candleDown: '#ef4444',
    volumeUp: 'rgba(34, 197, 94, 0.5)',
    volumeDown: 'rgba(239, 68, 68, 0.5)',
  },
} as const;

export type IndicatorId = 'sma' | 'ema' | 'bb' | 'vwap' | 'ichimoku' | 'rsi' | 'macd' | 'stoch' | 'atr';

export interface IndicatorConfig {
  enabled: boolean;
  params?: Record<string, number>;
}

export type IndicatorState = Record<IndicatorId, IndicatorConfig>;

export const DEFAULT_INDICATORS: IndicatorState = {
  sma:      { enabled: true,  params: { period1: 5, period2: 20 } },
  ema:      { enabled: false, params: { period1: 9, period2: 21 } },
  bb:       { enabled: false, params: { period: 20, stddev: 2 } },
  vwap:     { enabled: false },
  ichimoku: { enabled: false, params: { tenkan: 9, kijun: 26, senkou: 52 } },
  rsi:      { enabled: false, params: { period: 14 } },
  macd:     { enabled: false, params: { fast: 12, slow: 26, signal: 9 } },
  stoch:    { enabled: false, params: { kPeriod: 14, dPeriod: 3, smooth: 3 } },
  atr:      { enabled: false, params: { period: 14 } },
};

export interface OhlcvData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
