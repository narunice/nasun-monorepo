import { describe, it, expect } from 'vitest';
import {
  CLICKS_REQUIRED,
  DEFAULT_STYLES,
  FIBONACCI_LEVELS,
} from './types';
import type { DrawingType, DrawingLineStyle } from './types';

// ========================================
// CLICKS_REQUIRED
// ========================================
describe('CLICKS_REQUIRED', () => {
  it('horizontal-line needs 1 click', () => {
    expect(CLICKS_REQUIRED['horizontal-line']).toBe(1);
  });

  it('trend-line needs 2 clicks', () => {
    expect(CLICKS_REQUIRED['trend-line']).toBe(2);
  });

  it('fibonacci needs 2 clicks', () => {
    expect(CLICKS_REQUIRED['fibonacci']).toBe(2);
  });
});

// ========================================
// DEFAULT_STYLES
// ========================================
describe('DEFAULT_STYLES', () => {
  it('horizontal-line has amber dashed style', () => {
    const style = DEFAULT_STYLES['horizontal-line'];
    expect(style.color).toBe('#fbbf24');
    expect(style.lineWidth).toBe(1);
    expect(style.lineStyle).toBe('dashed');
  });

  it('trend-line has blue solid style', () => {
    const style = DEFAULT_STYLES['trend-line'];
    expect(style.color).toBe('#3b82f6');
    expect(style.lineWidth).toBe(1);
    expect(style.lineStyle).toBe('solid');
  });

  it('fibonacci has purple dashed style', () => {
    const style = DEFAULT_STYLES['fibonacci'];
    expect(style.color).toBe('#a855f7');
    expect(style.lineWidth).toBe(1);
    expect(style.lineStyle).toBe('dashed');
  });

  it('all drawing types have default styles', () => {
    const types: DrawingType[] = ['horizontal-line', 'trend-line', 'fibonacci'];
    for (const type of types) {
      expect(DEFAULT_STYLES[type]).toBeDefined();
      expect(DEFAULT_STYLES[type].color).toBeTruthy();
      expect(DEFAULT_STYLES[type].lineWidth).toBeGreaterThan(0);
    }
  });
});

// ========================================
// FIBONACCI_LEVELS
// ========================================
describe('FIBONACCI_LEVELS', () => {
  it('has 7 standard levels', () => {
    expect(FIBONACCI_LEVELS).toHaveLength(7);
  });

  it('starts at 0 and ends at 1', () => {
    expect(FIBONACCI_LEVELS[0]).toBe(0);
    expect(FIBONACCI_LEVELS[FIBONACCI_LEVELS.length - 1]).toBe(1);
  });

  it('includes key golden ratio levels', () => {
    expect(FIBONACCI_LEVELS).toContain(0.236);
    expect(FIBONACCI_LEVELS).toContain(0.382);
    expect(FIBONACCI_LEVELS).toContain(0.5);
    expect(FIBONACCI_LEVELS).toContain(0.618);
    expect(FIBONACCI_LEVELS).toContain(0.786);
  });

  it('levels are in ascending order', () => {
    for (let i = 1; i < FIBONACCI_LEVELS.length; i++) {
      expect(FIBONACCI_LEVELS[i]).toBeGreaterThan(FIBONACCI_LEVELS[i - 1]);
    }
  });
});
