// Technical Indicators Library
// Extracted from PriceChart.tsx for reusability and testability

// Moving Averages
export { calculateMA, calculateEMA } from './movingAverage';

// RSI (Relative Strength Index)
export { calculateRSI } from './rsi';

// MACD (Moving Average Convergence Divergence)
export { calculateMACD } from './macd';

// Data Generators
export { generateCandleData, generateVolumeData, fetchBinanceCandles, fetchBinance24hTicker, fetchBinanceRecentTrades, getBinanceSymbol } from './dataGenerator';
export type { Binance24hTicker, RecentTrade } from './dataGenerator';

// Types
export type { CandleWithVolume, MACDResult, CandlestickData, Time, LineData, HistogramData } from './types';
