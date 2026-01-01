import type { CandlestickData, Time, LineData, HistogramData } from 'lightweight-charts';

// Extended candle data with volume
export interface CandleWithVolume extends CandlestickData {
  volume: number;
}

// MACD result type
export interface MACDResult {
  macd: LineData[];
  signal: LineData[];
  histogram: HistogramData[];
}

// Re-export lightweight-charts types for convenience
export type { CandlestickData, Time, LineData, HistogramData };
