/**
 * TrendLineRenderer
 *
 * Renders a trend line between two points on the chart.
 * Uses IPrimitivePaneRenderer for Canvas-based rendering.
 */

import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { DrawingStyle, DrawingPoint } from './types';
import { applyLineStyle } from './utils';

class TrendLinePaneRenderer implements IPrimitivePaneRenderer {
  private _x1: number;
  private _y1: number;
  private _x2: number;
  private _y2: number;
  private _style: DrawingStyle;
  private _chartWidth: number;

  constructor(x1: number, y1: number, x2: number, y2: number, style: DrawingStyle, chartWidth: number) {
    this._x1 = x1;
    this._y1 = y1;
    this._x2 = x2;
    this._y2 = y2;
    this._style = style;
    this._chartWidth = chartWidth;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.save();
      ctx.strokeStyle = this._style.color;
      ctx.lineWidth = this._style.lineWidth;
      applyLineStyle(ctx, this._style.lineStyle);

      // Extend line to chart edges
      const dx = this._x2 - this._x1;
      const dy = this._y2 - this._y1;

      if (Math.abs(dx) < 0.001) {
        // Near-vertical line — extend well beyond any chart height
        const MAX_Y = 100_000;
        ctx.beginPath();
        ctx.moveTo(this._x1, 0);
        ctx.lineTo(this._x1, MAX_Y);
        ctx.stroke();
      } else {
        const slope = dy / dx;
        const startX = 0;
        const endX = this._chartWidth;
        const startY = this._y1 + slope * (startX - this._x1);
        const endY = this._y1 + slope * (endX - this._x1);

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }

      // Draw anchor points
      ctx.fillStyle = this._style.color;
      ctx.setLineDash([]);
      for (const [x, y] of [[this._x1, this._y1], [this._x2, this._y2]]) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });
  }
}

class TrendLinePaneView implements IPrimitivePaneView {
  private _source: TrendLinePrimitive;

  constructor(source: TrendLinePrimitive) {
    this._source = source;
  }

  renderer(): IPrimitivePaneRenderer | null {
    const series = this._source.series;
    const chart = this._source.chart;
    if (!series || !chart) return null;

    const p1 = this._source.points[0];
    const p2 = this._source.points[1];
    if (!p1 || !p2) return null;

    const y1 = series.priceToCoordinate(p1.price);
    const y2 = series.priceToCoordinate(p2.price);
    const x1 = chart.timeScale().timeToCoordinate(p1.time as Time);
    const x2 = chart.timeScale().timeToCoordinate(p2.time as Time);

    if (y1 === null || y2 === null || x1 === null || x2 === null) return null;

    const chartWidth = chart.timeScale().width();

    return new TrendLinePaneRenderer(
      x1 as number,
      y1 as number,
      x2 as number,
      y2 as number,
      this._source.style,
      chartWidth
    );
  }
}

export class TrendLinePrimitive implements ISeriesPrimitive<Time> {
  points: DrawingPoint[];
  style: DrawingStyle;
  series: SeriesAttachedParameter<Time>['series'] | null = null;
  chart: SeriesAttachedParameter<Time>['chart'] | null = null;

  private _paneViews: TrendLinePaneView[];

  constructor(points: DrawingPoint[], style: DrawingStyle) {
    this.points = points;
    this.style = style;
    this._paneViews = [new TrendLinePaneView(this)];
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
