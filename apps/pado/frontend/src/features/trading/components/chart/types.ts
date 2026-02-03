/**
 * PriceChart types and constants
 */

export type TimeInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

export const INTERVAL_CONFIG: Record<TimeInterval, { label: string; ms: number; count: number }> = {
  '1m': { label: '1분', ms: 60 * 1000, count: 120 },
  '5m': { label: '5분', ms: 5 * 60 * 1000, count: 96 },
  '15m': { label: '15분', ms: 15 * 60 * 1000, count: 96 },
  '1h': { label: '1시간', ms: 60 * 60 * 1000, count: 72 },
  '4h': { label: '4시간', ms: 4 * 60 * 60 * 1000, count: 90 },
  '1d': { label: '1일', ms: 24 * 60 * 60 * 1000, count: 90 },
  '1w': { label: '1주', ms: 7 * 24 * 60 * 60 * 1000, count: 104 },
};

export const CHART_HEIGHT = 280;
export const VOLUME_HEIGHT = 80;
export const RSI_HEIGHT = 80;
export const MACD_HEIGHT = 100;

export const CHART_COLORS = {
  dark: {
    background: '#1a1a2e',
    text: '#d1d4dc',
    grid: '#2B2B43',
    border: '#2B2B43',
  },
  light: {
    background: '#faf7f4',
    text: '#191615',
    grid: '#e5e2de',
    border: '#d4d1cd',
  },
} as const;

export interface IndicatorState {
  ma: boolean;
  rsi: boolean;
  macd: boolean;
}

export interface OhlcvData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
