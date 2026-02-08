/**
 * Chart Drawing Tool Type Definitions
 *
 * Types for user-drawn chart annotations (horizontal lines, trend lines, fibonacci).
 * Drawings are stored per-pool in localStorage and rendered via lightweight-charts Plugin API.
 */

export type DrawingType = 'horizontal-line' | 'trend-line' | 'fibonacci';

export type DrawingLineStyle = 'solid' | 'dashed' | 'dotted';

export interface DrawingStyle {
  color: string;
  lineWidth: number;
  lineStyle: DrawingLineStyle;
}

export interface DrawingPoint {
  /** Unix timestamp in seconds (chart time) */
  time: number;
  /** Price value */
  price: number;
}

export interface DrawingData {
  /** Unique identifier */
  id: string;
  /** Drawing type */
  type: DrawingType;
  /** Anchor points (1 for horizontal, 2 for trend/fib) */
  points: DrawingPoint[];
  /** Visual style */
  style: DrawingStyle;
  /** Optional label */
  label?: string;
}

/** Drawing tool selection state */
export type ActiveTool = DrawingType | null;

/** Number of clicks required for each tool */
export const CLICKS_REQUIRED: Record<DrawingType, number> = {
  'horizontal-line': 1,
  'trend-line': 2,
  'fibonacci': 2,
};

/** Default styles per drawing type */
export const DEFAULT_STYLES: Record<DrawingType, DrawingStyle> = {
  'horizontal-line': { color: '#fbbf24', lineWidth: 1, lineStyle: 'dashed' },
  'trend-line': { color: '#3b82f6', lineWidth: 1, lineStyle: 'solid' },
  'fibonacci': { color: '#a855f7', lineWidth: 1, lineStyle: 'dashed' },
};

/** Fibonacci retracement levels */
export const FIBONACCI_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
