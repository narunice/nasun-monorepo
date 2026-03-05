import type { CandlestickData, LineData } from 'lightweight-charts';

export interface IchimokuResult {
  tenkanSen: LineData[];
  kijunSen: LineData[];
  senkouSpanA: LineData[];
  senkouSpanB: LineData[];
  chikouSpan: LineData[];
}

interface IchimokuParams {
  tenkan: number;
  kijun: number;
  senkou: number;
}

const DEFAULT_PARAMS: IchimokuParams = { tenkan: 9, kijun: 26, senkou: 52 };

/**
 * Highest high / lowest low over a period ending at index i.
 */
function periodHighLow(data: CandlestickData[], i: number, period: number): { high: number; low: number } | null {
  if (i < period - 1) return null;
  let high = -Infinity;
  let low = Infinity;
  for (let j = i - period + 1; j <= i; j++) {
    if (data[j].high > high) high = data[j].high;
    if (data[j].low < low) low = data[j].low;
  }
  return { high, low };
}

/**
 * Compute Ichimoku Cloud indicator.
 * @param intervalMs - Interval duration in ms (needed for Senkou Span future shift)
 */
export function calculateIchimoku(
  data: CandlestickData[],
  intervalMs: number,
  params?: Partial<IchimokuParams>,
): IchimokuResult {
  const { tenkan, kijun, senkou } = { ...DEFAULT_PARAMS, ...params };
  const intervalSec = Math.floor(intervalMs / 1000);

  const tenkanSen: LineData[] = [];
  const kijunSen: LineData[] = [];
  const senkouSpanA: LineData[] = [];
  const senkouSpanB: LineData[] = [];
  const chikouSpan: LineData[] = [];

  for (let i = 0; i < data.length; i++) {
    const time = data[i].time as number;

    // Tenkan-sen (Conversion Line): (highest high + lowest low) / 2 over tenkan periods
    const tenkanHL = periodHighLow(data, i, tenkan);
    if (tenkanHL) {
      const tenkanVal = (tenkanHL.high + tenkanHL.low) / 2;
      tenkanSen.push({ time: data[i].time, value: tenkanVal });

      // Kijun-sen (Base Line): same calc over kijun periods
      const kijunHL = periodHighLow(data, i, kijun);
      if (kijunHL) {
        const kijunVal = (kijunHL.high + kijunHL.low) / 2;
        kijunSen.push({ time: data[i].time, value: kijunVal });

        // Senkou Span A: (tenkan + kijun) / 2, shifted kijun periods into the future
        const futureTime = (time + kijun * intervalSec) as typeof data[0]['time'];
        senkouSpanA.push({ time: futureTime, value: (tenkanVal + kijunVal) / 2 });
      }
    }

    // Senkou Span B: (highest high + lowest low) / 2 over senkou periods, shifted kijun periods forward
    const senkouHL = periodHighLow(data, i, senkou);
    if (senkouHL) {
      const futureTime = (time + kijun * intervalSec) as typeof data[0]['time'];
      senkouSpanB.push({ time: futureTime, value: (senkouHL.high + senkouHL.low) / 2 });
    }

    // Chikou Span: current close, shifted kijun periods into the past
    if (i >= kijun) {
      const pastTime = data[i - kijun].time;
      chikouSpan.push({ time: pastTime, value: data[i].close });
    }
  }

  return { tenkanSen, kijunSen, senkouSpanA, senkouSpanB, chikouSpan };
}
