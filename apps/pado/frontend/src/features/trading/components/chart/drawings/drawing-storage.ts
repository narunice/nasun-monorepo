/**
 * Drawing Storage - localStorage persistence for chart drawings
 *
 * Drawings are stored per-pool so switching between markets
 * shows the correct annotations.
 */

import type { DrawingData } from './types';
import { MAX_DRAWINGS_PER_POOL } from './utils';

const STORAGE_PREFIX = 'pado:chart:drawings:';

function getStorageKey(poolId: string): string {
  return `${STORAGE_PREFIX}${poolId}`;
}

/**
 * Load all drawings for a pool
 */
export function loadDrawings(poolId: string): DrawingData[] {
  try {
    const raw = localStorage.getItem(getStorageKey(poolId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d: unknown): d is DrawingData =>
        typeof d === 'object' && d !== null &&
        'id' in d && 'type' in d && 'points' in d && 'style' in d
    );
  } catch {
    return [];
  }
}

/**
 * Save all drawings for a pool
 */
function saveDrawings(poolId: string, drawings: DrawingData[]): void {
  try {
    localStorage.setItem(getStorageKey(poolId), JSON.stringify(drawings));
  } catch {
    // localStorage full - silently fail
  }
}

/**
 * Add a drawing (respects per-pool limit)
 * @returns true if added, false if limit reached
 */
export function addDrawing(poolId: string, drawing: DrawingData): boolean {
  const drawings = loadDrawings(poolId);
  if (drawings.length >= MAX_DRAWINGS_PER_POOL) return false;
  drawings.push(drawing);
  saveDrawings(poolId, drawings);
  return true;
}

/**
 * Remove a drawing by ID
 */
export function removeDrawing(poolId: string, drawingId: string): void {
  const drawings = loadDrawings(poolId).filter((d) => d.id !== drawingId);
  saveDrawings(poolId, drawings);
}

/**
 * Remove all drawings for a pool
 */
export function clearDrawings(poolId: string): void {
  saveDrawings(poolId, []);
}
