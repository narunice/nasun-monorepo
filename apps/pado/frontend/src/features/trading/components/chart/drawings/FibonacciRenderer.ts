/**
 * FibonacciRenderer
 *
 * Renders Fibonacci retracement levels between two price points.
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
import { FIBONACCI_LEVELS } from './types';

interface FibLevel {
  level: number;
  price: number;
  y: number;
}

class FibonacciPaneRenderer implements IPrimitivePaneRenderer {
  private _levels: FibLevel[];
  private _width: number;
  private _style: DrawingStyle;

  constructor(levels: FibLevel[], width: number, style: DrawingStyle) {
    this._levels = levels;
    this._width = width;
    this._style = style;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.save();

      // Draw filled regions between levels
      for (let i = 0; i < this._levels.length - 1; i++) {
        const current = this._levels[i];
        const next = this._levels[i + 1];

        ctx.globalAlpha = 0.03;
        ctx.fillStyle = this._style.color;
        ctx.fillRect(0, current.y, this._width, next.y - current.y);
        ctx.globalAlpha = 1.0;
      }

      // Draw lines and labels for each level
      for (const { level, price, y } of this._levels) {
        // Line
        ctx.strokeStyle = this._style.color;
        ctx.lineWidth = level === 0 || level === 1 ? this._style.lineWidth + 0.5 : this._style.lineWidth;
        ctx.setLineDash(level === 0.5 ? [4, 4] : [6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this._width, y);
        ctx.stroke();

        // Label
        const pct = (level * 100).toFixed(1);
        const priceStr = `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const label = `${pct}% (${priceStr})`;

        ctx.font = '10px Rubik, sans-serif';
        const textWidth = ctx.measureText(label).width;
        const padding = 3;
        const labelX = 8;
        const labelY = y - 3;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(labelX - padding, labelY - 10, textWidth + padding * 2, 13);

        // Text
        ctx.fillStyle = this._style.color;
        ctx.fillText(label, labelX, labelY);
      }

      ctx.restore();
    });
  }
}

class FibonacciPaneView implements IPrimitivePaneView {
  private _source: FibonacciPrimitive;

  constructor(source: FibonacciPrimitive) {
    this._source = source;
  }

  renderer(): IPrimitivePaneRenderer | null {
    const series = this._source.series;
    const chart = this._source.chart;
    if (!series || !chart) return null;

    const p1 = this._source.points[0];
    const p2 = this._source.points[1];
    if (!p1 || !p2) return null;

    const highPrice = Math.max(p1.price, p2.price);
    const lowPrice = Math.min(p1.price, p2.price);
    const priceRange = highPrice - lowPrice;

    if (priceRange <= 0) return null;

    const levels: FibLevel[] = [];
    for (const level of FIBONACCI_LEVELS) {
      const price = highPrice - priceRange * level;
      const y = series.priceToCoordinate(price);
      if (y !== null) {
        levels.push({ level, price, y: y as number });
      }
    }

    if (levels.length < 2) return null;

    const width = chart.timeScale().width();
    return new FibonacciPaneRenderer(levels, width, this._source.style);
  }
}

export class FibonacciPrimitive implements ISeriesPrimitive<Time> {
  points: DrawingPoint[];
  style: DrawingStyle;
  series: SeriesAttachedParameter<Time>['series'] | null = null;
  chart: SeriesAttachedParameter<Time>['chart'] | null = null;

  private _paneViews: FibonacciPaneView[];

  constructor(points: DrawingPoint[], style: DrawingStyle) {
    this.points = points;
    this.style = style;
    this._paneViews = [new FibonacciPaneView(this)];
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
