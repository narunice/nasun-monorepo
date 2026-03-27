/**
 * IchimokuCloudRenderer
 *
 * Renders the Ichimoku cloud (kumo) fill between Senkou Span A and B.
 * Uses ISeriesPrimitive for Canvas-based rendering behind candles.
 * Attach to the ichSenkouA LineSeries.
 */

import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  LineData,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { PrimitivePaneViewZOrder } from 'lightweight-charts';

class IchimokuCloudPaneRenderer implements IPrimitivePaneRenderer {
  private _points: { x: number; yA: number; yB: number }[];

  constructor(points: { x: number; yA: number; yB: number }[]) {
    this._points = points;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (this._points.length < 2) return;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.save();

      // Split into segments at crossover points and fill each segment
      const segments = this._splitAtCrossovers(this._points);

      for (const seg of segments) {
        if (seg.points.length < 2) continue;

        // Determine fill color: if A is visually above B (lower y), it's bullish
        const midIdx = Math.floor(seg.points.length / 2);
        const isBullish = seg.points[midIdx].yA <= seg.points[midIdx].yB;

        ctx.fillStyle = isBullish
          ? 'rgba(34, 197, 94, 0.08)'   // green
          : 'rgba(239, 68, 68, 0.08)';  // red

        ctx.beginPath();
        // Forward path: spanA
        ctx.moveTo(seg.points[0].x, seg.points[0].yA);
        for (let i = 1; i < seg.points.length; i++) {
          ctx.lineTo(seg.points[i].x, seg.points[i].yA);
        }
        // Reverse path: spanB
        for (let i = seg.points.length - 1; i >= 0; i--) {
          ctx.lineTo(seg.points[i].x, seg.points[i].yB);
        }
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    });
  }

  /**
   * Split point array at crossover points (where spanA crosses spanB)
   * and interpolate the exact crossing coordinate.
   */
  private _splitAtCrossovers(
    points: { x: number; yA: number; yB: number }[],
  ): { points: { x: number; yA: number; yB: number }[] }[] {
    if (points.length < 2) return [{ points }];

    const segments: { points: { x: number; yA: number; yB: number }[] }[] = [];
    let current: { x: number; yA: number; yB: number }[] = [points[0]];

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      const prevDiff = prev.yA - prev.yB;
      const currDiff = curr.yA - curr.yB;

      // Check for crossover (sign change)
      if (prevDiff !== 0 && currDiff !== 0 && Math.sign(prevDiff) !== Math.sign(currDiff)) {
        // Linear interpolation to find crossover point
        const t = prevDiff / (prevDiff - currDiff);
        const crossX = prev.x + t * (curr.x - prev.x);
        const crossY = prev.yA + t * (curr.yA - prev.yA);
        const crossPoint = { x: crossX, yA: crossY, yB: crossY };

        current.push(crossPoint);
        segments.push({ points: current });
        current = [crossPoint, curr];
      } else {
        current.push(curr);
      }
    }

    if (current.length > 0) {
      segments.push({ points: current });
    }

    return segments;
  }
}

class IchimokuCloudPaneView implements IPrimitivePaneView {
  private _source: IchimokuCloudPrimitive;

  constructor(source: IchimokuCloudPrimitive) {
    this._source = source;
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer | null {
    const series = this._source.series;
    const chart = this._source.chart;
    if (!series || !chart) return null;

    const timeScale = chart.timeScale();
    const spanAData = this._source.senkouSpanA;
    const spanBData = this._source.senkouSpanB;

    if (spanAData.length === 0 || spanBData.length === 0) return null;

    // Join span A and B by time using a Map
    const spanBMap = new Map<number, number>();
    for (const pt of spanBData) {
      spanBMap.set(pt.time as number, pt.value);
    }

    const points: { x: number; yA: number; yB: number }[] = [];

    for (const ptA of spanAData) {
      const timeNum = ptA.time as number;
      const bVal = spanBMap.get(timeNum);
      if (bVal === undefined) continue;

      const x = timeScale.timeToCoordinate(ptA.time);
      if (x === null) continue;

      const yA = series.priceToCoordinate(ptA.value);
      const yB = series.priceToCoordinate(bVal);
      if (yA === null || yB === null) continue;

      points.push({ x: x as number, yA: yA as number, yB: yB as number });
    }

    if (points.length < 2) return null;

    return new IchimokuCloudPaneRenderer(points);
  }
}

export class IchimokuCloudPrimitive implements ISeriesPrimitive<Time> {
  series: SeriesAttachedParameter<Time>['series'] | null = null;
  chart: SeriesAttachedParameter<Time>['chart'] | null = null;
  senkouSpanA: LineData[] = [];
  senkouSpanB: LineData[] = [];

  private _paneViews: IchimokuCloudPaneView[];

  constructor(senkouSpanA: LineData[], senkouSpanB: LineData[]) {
    this.senkouSpanA = senkouSpanA;
    this.senkouSpanB = senkouSpanB;
    this._paneViews = [new IchimokuCloudPaneView(this)];
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.series = param.series;
    this.chart = param.chart;
  }

  detached(): void {
    this.series = null;
    this.chart = null;
  }

  paneViews(): IPrimitivePaneView[] {
    return this._paneViews;
  }
}
