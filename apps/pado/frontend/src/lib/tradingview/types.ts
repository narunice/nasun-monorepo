/**
 * TradingView Charting Library type definitions
 *
 * Minimal subset of the official TradingView types needed for the Datafeed adapter.
 * These will be replaced by the official types from `charting_library/charting_library.d.ts`
 * once the TradingView license is approved.
 */

// ========================================
// Datafeed API Types
// ========================================

export interface DatafeedConfiguration {
  supported_resolutions: string[];
  exchanges?: Exchange[];
  symbols_types?: SymbolType[];
  supports_marks?: boolean;
  supports_timescale_marks?: boolean;
  supports_time?: boolean;
}

export interface Exchange {
  value: string;
  name: string;
  desc: string;
}

export interface SymbolType {
  name: string;
  value: string;
}

export interface LibrarySymbolInfo {
  name: string;
  full_name: string;
  ticker?: string;
  description: string;
  type: string;
  session: string;
  exchange: string;
  listed_exchange: string;
  timezone: string;
  format: 'price' | 'volume';
  pricescale: number;
  minmov: number;
  has_intraday: boolean;
  has_weekly_and_monthly?: boolean;
  has_daily?: boolean;
  supported_resolutions: string[];
  volume_precision?: number;
  data_status: 'streaming' | 'endofday' | 'pulsed' | 'delayed_streaming';
}

export interface Bar {
  time: number; // UTC timestamp in milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PeriodParams {
  from: number; // UTC timestamp in seconds
  to: number;   // UTC timestamp in seconds
  countBack: number;
  firstDataRequest: boolean;
}

export interface Mark {
  id: string | number;
  time: number;
  color: string;
  text: string;
  label: string;
  labelFontColor: string;
  minSize: number;
}

export type OnReadyCallback = (config: DatafeedConfiguration) => void;
export type ResolveCallback = (symbolInfo: LibrarySymbolInfo) => void;
export type ErrorCallback = (reason: string) => void;
export type HistoryCallback = (bars: Bar[], meta: { noData?: boolean; nextTime?: number }) => void;
export type SubscribeBarsCallback = (bar: Bar) => void;
export type SearchSymbolsCallback = (items: SearchSymbolResultItem[]) => void;

export interface SearchSymbolResultItem {
  symbol: string;
  full_name: string;
  description: string;
  exchange: string;
  ticker: string;
  type: string;
}

export interface IDatafeedChartApi {
  onReady(callback: OnReadyCallback): void;
  searchSymbols(
    userInput: string,
    exchange: string,
    symbolType: string,
    onResult: SearchSymbolsCallback,
  ): void;
  resolveSymbol(
    symbolName: string,
    onResolve: ResolveCallback,
    onError: ErrorCallback,
  ): void;
  getBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: string,
    periodParams: PeriodParams,
    onResult: HistoryCallback,
    onError: ErrorCallback,
  ): void;
  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: string,
    onTick: SubscribeBarsCallback,
    listenerGuid: string,
    onResetCacheNeededCallback: () => void,
  ): void;
  unsubscribeBars(listenerGuid: string): void;
}

// ========================================
// Widget API Types
// ========================================

export interface ChartingLibraryWidgetOptions {
  container: HTMLElement;
  datafeed: IDatafeedChartApi;
  library_path: string;
  locale: string;
  symbol: string;
  interval: string;
  theme: 'Dark' | 'Light';
  fullscreen: boolean;
  autosize: boolean;
  disabled_features?: string[];
  enabled_features?: string[];
  custom_css_url?: string;
  overrides?: Record<string, string>;
  timezone?: string;
  debug?: boolean;
}

export interface IChartWidgetApi {
  setSymbol(symbol: string, interval: string, callback?: () => void): void;
  createShape(
    point: { price: number; time?: number },
    options: {
      shape: string;
      overrides?: Record<string, string | number | boolean>;
    },
  ): string | null;
  removeAllShapes(): void;
}

export interface IChartingLibraryWidget {
  onChartReady(callback: () => void): void;
  activeChart(): IChartWidgetApi;
  changeTheme(theme: 'Dark' | 'Light'): void;
  remove(): void;
  setSymbol(symbol: string, interval: string, callback?: () => void): void;
}

// Global TradingView namespace (available after charting_library loads)
declare global {
  interface Window {
    TradingView?: {
      widget: new (options: ChartingLibraryWidgetOptions) => IChartingLibraryWidget;
    };
  }
}
