// Technical Indicators Library
// Extracted from PriceChart.tsx for reusability and testability

// Moving Averages
export { calculateMA, calculateEMA, calculateEMALine } from './movingAverage';

// RSI (Relative Strength Index)
export { calculateRSI } from './rsi';

// MACD (Moving Average Convergence Divergence)
export { calculateMACD } from './macd';

// Bollinger Bands
export { calculateBollingerBands } from './bollingerBands';

// Stochastic Oscillator
export { calculateStochastic } from './stochastic';

// ATR (Average True Range)
export { calculateATR } from './atr';

// VWAP (Volume Weighted Average Price)
export { calculateVWAP } from './vwap';

// Ichimoku Cloud
export { calculateIchimoku } from './ichimoku';
export type { IchimokuResult } from './ichimoku';

// Data Generators
export { generateCandleData, generateVolumeData, fetchBinanceCandles, fetchBinance24hTicker, fetchBinanceMultiTicker, fetchBinanceRecentTrades, getBinanceSymbol } from './dataGenerator';
export type { Binance24hTicker, RecentTrade } from './dataGenerator';

// Types
export type { CandleWithVolume, MACDResult, BollingerBandsResult, StochasticResult, CandlestickData, Time, LineData, HistogramData } from './types';
