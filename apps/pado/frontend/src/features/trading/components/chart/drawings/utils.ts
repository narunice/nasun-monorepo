/**
 * Shared drawing utilities for chart renderers
 */

import type { DrawingLineStyle } from './types';

/** Maximum drawings per pool to prevent localStorage bloat */
export const MAX_DRAWINGS_PER_POOL = 100;

/**
 * Apply line dash style to a canvas context
 */
export function applyLineStyle(ctx: CanvasRenderingContext2D, style: DrawingLineStyle): void {
  switch (style) {
    case 'dashed':
      ctx.setLineDash([6, 4]);
      break;
    case 'dotted':
      ctx.setLineDash([2, 3]);
      break;
    default:
      ctx.setLineDash([]);
  }
}
