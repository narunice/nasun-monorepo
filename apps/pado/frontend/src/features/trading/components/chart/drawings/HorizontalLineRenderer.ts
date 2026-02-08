/**
 * HorizontalLineRenderer
 *
 * Renders a horizontal price line on the chart using lightweight-charts v5 Plugin API.
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
import type { DrawingStyle } from './types';
import { applyLineStyle } from './utils';

class HorizontalLinePaneRenderer implements IPrimitivePaneRenderer {
  private _y: number;
  private _width: number;
  private _style: DrawingStyle;
  private _label: string;

  constructor(y: number, width: number, style: DrawingStyle, label: string) {
    this._y = y;
    this._width = width;
    this._style = style;
    this._label = label;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      const y = this._y;

      ctx.save();

      // Draw line
      ctx.strokeStyle = this._style.color;
      ctx.lineWidth = this._style.lineWidth;
      applyLineStyle(ctx, this._style.lineStyle);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this._width, y);
      ctx.stroke();

      // Draw label
      if (this._label) {
        ctx.font = '11px Rubik, sans-serif';
        ctx.fillStyle = this._style.color;
        const textWidth = ctx.measureText(this._label).width;
        const padding = 4;
        const labelX = this._width - textWidth - padding * 2 - 8;
        const labelY = y - 8;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(labelX, labelY - 10, textWidth + padding * 2, 14);

        // Text
        ctx.fillStyle = this._style.color;
        ctx.fillText(this._label, labelX + padding, labelY);
      }

      ctx.restore();
    });
  }
}

class HorizontalLinePaneView implements IPrimitivePaneView {
  private _source: HorizontalLinePrimitive;

  constructor(source: HorizontalLinePrimitive) {
    this._source = source;
  }

  renderer(): IPrimitivePaneRenderer | null {
    const series = this._source.series;
    if (!series) return null;

    const priceToCoordinate = series.priceToCoordinate(this._source.price);
    if (priceToCoordinate === null) return null;

    const chart = this._source.chart;
    if (!chart) return null;

    const width = chart.timeScale().width();

    return new HorizontalLinePaneRenderer(
      priceToCoordinate,
      width,
      this._source.style,
      this._source.label
    );
  }
}

export class HorizontalLinePrimitive implements ISeriesPrimitive<Time> {
  price: number;
  style: DrawingStyle;
  label: string;
  series: SeriesAttachedParameter<Time>['series'] | null = null;
  chart: SeriesAttachedParameter<Time>['chart'] | null = null;

  private _paneViews: HorizontalLinePaneView[];

  constructor(price: number, style: DrawingStyle, label: string = '') {
    this.price = price;
    this.style = style;
    this.label = label || `$${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    this._paneViews = [new HorizontalLinePaneView(this)];
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

  updatePrice(price: number): void {
    this.price = price;
    this.label = `$${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  }
}
