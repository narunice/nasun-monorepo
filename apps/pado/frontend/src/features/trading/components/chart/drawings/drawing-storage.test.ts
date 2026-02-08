import { describe, it, expect } from 'vitest';
import { loadDrawings, addDrawing, removeDrawing, clearDrawings } from './drawing-storage';
import type { DrawingData } from './types';
import { MAX_DRAWINGS_PER_POOL } from './utils';

const POOL_ID = '0xtest-pool-123';

function makeDrawing(id: string, type: DrawingData['type'] = 'horizontal-line'): DrawingData {
  return {
    id,
    type,
    points: [{ time: 1000, price: 50000 }],
    style: { color: '#fbbf24', lineWidth: 1, lineStyle: 'dashed' },
  };
}

// ========================================
// loadDrawings
// ========================================
describe('loadDrawings', () => {
  it('returns empty array when no drawings stored', () => {
    expect(loadDrawings(POOL_ID)).toEqual([]);
  });

  it('returns stored drawings', () => {
    const drawings = [makeDrawing('d1'), makeDrawing('d2')];
    localStorage.setItem(`pado:chart:drawings:${POOL_ID}`, JSON.stringify(drawings));

    const result = loadDrawings(POOL_ID);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('d1');
  });

  it('filters out malformed drawings', () => {
    const data = [
      makeDrawing('valid'),
      { id: 'no-type', points: [], style: {} }, // missing 'type'
      null,
      'garbage',
    ];
    localStorage.setItem(`pado:chart:drawings:${POOL_ID}`, JSON.stringify(data));

    const result = loadDrawings(POOL_ID);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('valid');
  });

  it('returns empty for invalid JSON', () => {
    localStorage.setItem(`pado:chart:drawings:${POOL_ID}`, 'not-json');
    expect(loadDrawings(POOL_ID)).toEqual([]);
  });

  it('returns empty for non-array JSON', () => {
    localStorage.setItem(`pado:chart:drawings:${POOL_ID}`, '{"key":"value"}');
    expect(loadDrawings(POOL_ID)).toEqual([]);
  });

  it('separates drawings by pool ID', () => {
    const poolA = '0xpool-a';
    const poolB = '0xpool-b';

    addDrawing(poolA, makeDrawing('a1'));
    addDrawing(poolB, makeDrawing('b1'));
    addDrawing(poolB, makeDrawing('b2'));

    expect(loadDrawings(poolA)).toHaveLength(1);
    expect(loadDrawings(poolB)).toHaveLength(2);
  });
});

// ========================================
// addDrawing
// ========================================
describe('addDrawing', () => {
  it('adds a drawing and persists to localStorage', () => {
    const result = addDrawing(POOL_ID, makeDrawing('d1'));
    expect(result).toBe(true);
    expect(loadDrawings(POOL_ID)).toHaveLength(1);
  });

  it('appends multiple drawings', () => {
    addDrawing(POOL_ID, makeDrawing('d1'));
    addDrawing(POOL_ID, makeDrawing('d2'));
    addDrawing(POOL_ID, makeDrawing('d3'));
    expect(loadDrawings(POOL_ID)).toHaveLength(3);
  });

  it('enforces MAX_DRAWINGS_PER_POOL limit (100)', () => {
    expect(MAX_DRAWINGS_PER_POOL).toBe(100);

    // Seed 100 drawings
    const drawings = Array.from({ length: 100 }, (_, i) => makeDrawing(`d-${i}`));
    localStorage.setItem(`pado:chart:drawings:${POOL_ID}`, JSON.stringify(drawings));

    const result = addDrawing(POOL_ID, makeDrawing('d-overflow'));
    expect(result).toBe(false);
    expect(loadDrawings(POOL_ID)).toHaveLength(100);
  });

  it('supports different drawing types', () => {
    const hLine = makeDrawing('h1', 'horizontal-line');
    const tLine: DrawingData = {
      id: 't1',
      type: 'trend-line',
      points: [{ time: 1000, price: 50000 }, { time: 2000, price: 55000 }],
      style: { color: '#3b82f6', lineWidth: 1, lineStyle: 'solid' },
    };
    const fib: DrawingData = {
      id: 'f1',
      type: 'fibonacci',
      points: [{ time: 1000, price: 50000 }, { time: 2000, price: 60000 }],
      style: { color: '#a855f7', lineWidth: 1, lineStyle: 'dashed' },
    };

    addDrawing(POOL_ID, hLine);
    addDrawing(POOL_ID, tLine);
    addDrawing(POOL_ID, fib);

    const stored = loadDrawings(POOL_ID);
    expect(stored).toHaveLength(3);
    expect(stored.map(d => d.type)).toEqual(['horizontal-line', 'trend-line', 'fibonacci']);
  });
});

// ========================================
// removeDrawing
// ========================================
describe('removeDrawing', () => {
  it('removes drawing by ID', () => {
    addDrawing(POOL_ID, makeDrawing('d1'));
    addDrawing(POOL_ID, makeDrawing('d2'));
    addDrawing(POOL_ID, makeDrawing('d3'));

    removeDrawing(POOL_ID, 'd2');

    const remaining = loadDrawings(POOL_ID);
    expect(remaining).toHaveLength(2);
    expect(remaining.map(d => d.id)).toEqual(['d1', 'd3']);
  });

  it('no-op for non-existent ID', () => {
    addDrawing(POOL_ID, makeDrawing('d1'));
    removeDrawing(POOL_ID, 'non-existent');
    expect(loadDrawings(POOL_ID)).toHaveLength(1);
  });
});

// ========================================
// clearDrawings
// ========================================
describe('clearDrawings', () => {
  it('removes all drawings for a pool', () => {
    addDrawing(POOL_ID, makeDrawing('d1'));
    addDrawing(POOL_ID, makeDrawing('d2'));

    clearDrawings(POOL_ID);
    expect(loadDrawings(POOL_ID)).toEqual([]);
  });

  it('does not affect other pools', () => {
    const poolA = '0xpool-a';
    const poolB = '0xpool-b';

    addDrawing(poolA, makeDrawing('a1'));
    addDrawing(poolB, makeDrawing('b1'));

    clearDrawings(poolA);

    expect(loadDrawings(poolA)).toEqual([]);
    expect(loadDrawings(poolB)).toHaveLength(1);
  });
});
